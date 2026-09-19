// Talks to Razorpay's REST API directly over fetch (rather than importing
// the `razorpay` npm package) - keeps this dependency-free, which matters
// more in a Deno Edge Function than it did in the old Node/Firebase
// backend, where npm packages were the natural choice.

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
  // Test mode is still fine for staging - but it now requires a conscious,
  // explicit opt-in secret (ALLOW_TEST_MODE=true) rather than being the
  // silent default the moment a test key ends up deployed. Without that
  // opt-in, a test key hard-fails every request instead of quietly
  // accepting real student payments against a test-mode order.
  if (keyId.startsWith("rzp_test_")) {
    const allowTestMode = Deno.env.get("ALLOW_TEST_MODE") === "true";
    if (!allowTestMode) {
      throw new Error(
        "Refusing to run with a rzp_test_ Razorpay key: ALLOW_TEST_MODE is not set to 'true'. " +
          "If this is staging and test mode is intentional, run " +
          "`supabase secrets set ALLOW_TEST_MODE=true`. " +
          "If this is production, you have the wrong key deployed - run " +
          "`supabase secrets set RAZORPAY_KEY_ID=rzp_live_...` and " +
          "`supabase secrets set RAZORPAY_KEY_SECRET=...` with your LIVE keys from " +
          "the Razorpay Dashboard (Settings -> API Keys, Live mode toggle)."
      );
    }
    console.warn(
      "[razorpay] RUNNING IN TEST MODE (RAZORPAY_KEY_ID starts with rzp_test_, " +
        "ALLOW_TEST_MODE=true). Real payments will NOT be processed."
    );
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


// signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)
// Must match exactly what the client (Checkout.js) sends back.
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

  const signatureBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
  );

  const expected = Array.from(new Uint8Array(signatureBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time-ish comparison. Both strings are fixed-length hex from
  // our own HMAC output vs. the caller's string, so a straightforward
  // length + char loop is enough here (Deno's std has no built-in
  // timingSafeEqual for strings).
  const actual = params.razorpaySignature;
  if (expected.length !== actual.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return mismatch === 0;
}
