// Talks to Razorpay's REST API directly over fetch (rather than importing
// the `razorpay` npm package) - keeps this dependency-free, which matters
// more in a Deno Edge Function than it did in the old Node/Firebase
// backend, where npm packages were the natural choice.

// Every call to Razorpay is bounded so a stalled connection fails fast (create-order answers 502,
// the webhook answers 5xx and Razorpay retries) instead of hanging until the platform kills the function.
const RAZORPAY_TIMEOUT_MS = 15_000;

function getKeys(): { keyId: string; keySecret: string } {
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay keys are not configured. Run:\n" +
        "  supabase secrets set RAZORPAY_KEY_ID=...\n" +
        "  supabase secrets set RAZORPAY_KEY_SECRET=..."
    );
  }

  // SAFETY CHECK: a previous incident had a real rzp_test_ key committed
  // to the repo (see SECURITY_NOTICE.md) and silently deployed as this
  // function's production secret - a console.warn() alone was too easy to
  // miss in logs nobody was watching, and every order kept getting created
  // as a Razorpay TEST order, which real UPI apps (PhonePe/GPay) do not
  // handle the same way as a live order (unreliable callbacks, different
  // auto-capture timing) - this was the actual root cause of intermittent
  // "payment succeeded but verification could not be confirmed" reports.
  //
  // The independent APP_ENV marker is required. ALLOW_TEST_MODE is deliberately
  // ignored: a production project must never accept test credentials.
  const appEnv = Deno.env.get("APP_ENV");
  if (appEnv !== "production" && appEnv !== "staging") {
    throw new Error("APP_ENV must be explicitly set to production or staging");
  }
  if (keyId.startsWith("rzp_test_")) {
    if (appEnv !== "staging") throw new Error("Refusing test Razorpay key outside staging");
    console.warn("[razorpay] RUNNING IN STAGING TEST MODE. Real payments will NOT be processed.");
  }

  return { keyId, keySecret };
}

// Lets callers (e.g. `pay`) tell the client which mode it's in, so the app
// can visibly label the checkout screen "TEST MODE" instead of a student
// silently paying (or trying to pay) against a non-live order.
export function isLiveMode(): boolean {
  return getKeys().keyId.startsWith("rzp_live_");
}

export function getRazorpayKeyId(): string {
  return getKeys().keyId;
}

export async function createRazorpayOrder(params: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ id: string }> {
  const { keyId, keySecret } = getKeys();

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    signal: AbortSignal.timeout(RAZORPAY_TIMEOUT_MS),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: "INR",
      receipt: params.receipt,
      notes: params.notes ?? {},
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Razorpay order creation failed (${res.status}): ${body}`);
  }

  return (await res.json()) as { id: string };
}

// Server-to-server, authoritative check: asks Razorpay directly whether an
// order has a captured payment, using our own secret key. Used for
// "recovery" - e.g. when the app's WebView never got to relay Checkout's
// success callback (Android killed the WebView's renderer process while
// the app was backgrounded for a UPI app switch) even though the payment
// itself went through fine on Razorpay's side. Doesn't need a client-
// supplied signature at all, since this is us asking Razorpay ourselves.
export async function fetchCapturedPaymentForOrder(
  razorpayOrderId: string
): Promise<{ id: string; amount: number } | null> {
  const { keyId, keySecret } = getKeys();

  const res = await fetch(`https://api.razorpay.com/v1/orders/${razorpayOrderId}/payments`, {
    signal: AbortSignal.timeout(RAZORPAY_TIMEOUT_MS),
    headers: { Authorization: "Basic " + btoa(`${keyId}:${keySecret}`) },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Razorpay order-payments lookup failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { items: { id: string; status: string; amount: number }[] };
  const captured = data.items.find((p) => p.status === "captured");
  return captured ? { id: captured.id, amount: captured.amount } : null;
}


export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  status: string;
  amount: number;
  currency: string;
  captured?: boolean;
  created_at?: number; // epoch seconds: when the customer started this payment
  amount_refunded?: number;
  refund_status?: string | null; // "partial" | "full" | null
};

async function razorpayGet<T>(path: string): Promise<T> {
  const { keyId, keySecret } = getKeys();
  const res = await fetch(`https://api.razorpay.com/v1/${path}`, {
    signal: AbortSignal.timeout(RAZORPAY_TIMEOUT_MS),
    headers: { Authorization: "Basic " + btoa(`${keyId}:${keySecret}`) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Razorpay GET ${path.split("/")[0]} failed (${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

// Authoritative, server-to-server fetch of a single payment.
export function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  return razorpayGet<RazorpayPayment>(`payments/${encodeURIComponent(paymentId)}`);
}

export type RazorpayRefund = {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: number;
};

export function fetchRefund(refundId: string): Promise<RazorpayRefund> {
  return razorpayGet<RazorpayRefund>(`refunds/${encodeURIComponent(refundId)}`);
}

// The stable request marker is sent in refund notes. Before every POST (also
// after an ambiguous timeout), enumerate the payment's refunds and recover the
// provider refund id. Razorpay limits aggregate refunds to the captured amount.
export async function refundCapturedPayment(paymentId: string, amountPaise: number,
  requestId: string, knownRefundId?: string | null): Promise<RazorpayRefund> {
  if (knownRefundId) {
    const known = await fetchRefund(knownRefundId);
    if (known.payment_id !== paymentId || known.amount !== amountPaise || known.status !== "processed")
      throw new Error("Known compensation refund is not processed");
    return known;
  }
  for (let skip = 0; skip < 1000; skip += 100) {
    const page = await razorpayGet<{ items: (RazorpayRefund & { notes?: Record<string,string> })[] }>(
      `payments/${encodeURIComponent(paymentId)}/refunds?count=100&skip=${skip}`);
    const match = page.items.find((item) => item.notes?.medveda_refund_request_id === requestId);
    if (match) {
      if (match.amount !== amountPaise || match.status !== "processed")
        throw new Error("Compensation refund not yet processed or amount mismatch");
      return match;
    }
    if (page.items.length < 100) break;
  }
  const payment = await fetchPayment(paymentId);
  if (payment.amount_refunded && payment.amount_refunded > 0)
    throw new Error("Payment already has an unmatched refund; manual review required");
  if (payment.amount !== amountPaise || payment.currency !== "INR" || payment.status !== "captured")
    throw new Error("Payment is no longer eligible for full automatic refund");
  const { keyId, keySecret } = getKeys();
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    signal: AbortSignal.timeout(RAZORPAY_TIMEOUT_MS), method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(`${keyId}:${keySecret}`) },
    body: JSON.stringify({ amount: amountPaise, notes: { medveda_refund_request_id: requestId } }),
  });
  if (!response.ok) throw new Error(`Razorpay compensation refund failed (${response.status})`);
  const refund = await response.json() as RazorpayRefund;
  if (refund.payment_id !== paymentId || refund.amount !== amountPaise || refund.status !== "processed")
    throw new Error("Razorpay compensation refund response requires reconciliation");
  return refund;
}

export type RazorpayDispute = {
  id: string;
  payment_id: string;
  status: string; // "open" | "under_review" | "won" | "lost" | "closed"
  phase?: string; // "chargeback" | "fraud" | ...
  amount?: number;
};

// Authoritative, server-to-server fetch of a single dispute (chargeback).
export function fetchDispute(disputeId: string): Promise<RazorpayDispute> {
  return razorpayGet<RazorpayDispute>(`disputes/${encodeURIComponent(disputeId)}`);
}

export function fetchRazorpayOrder(
  razorpayOrderId: string
): Promise<{ id: string; amount: number; currency: string; status: string }> {
  return razorpayGet(`orders/${encodeURIComponent(razorpayOrderId)}`);
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// signature = HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, KEY_SECRET)
// Must match exactly what Checkout.js sends back. Compared in constant time
// over the decoded 32-byte digests (no early exit on the first differing byte).
export async function verifyPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<boolean> {
  const { keySecret } = getKeys();

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(keySecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(`${params.razorpayOrderId}|${params.razorpayPaymentId}`))
  );
  const actual = hexToBytes(params.razorpaySignature);
  if (!actual) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
  return diff === 0;
}
