import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const encoder = new TextEncoder();
const HEX_SIGNATURE = /^[0-9a-f]{64}$/i;

function response(status: number, body?: Record<string, string>): Response {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
}

function requiredSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name} Edge Function secret`);
  return value;
}

async function hmacSha256Hex(secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Web Crypto has no timingSafeEqual. Compare fixed-width, decoded SHA-256
// bytes without returning early. Invalidly-shaped signatures are rejected
// before this function, so both arrays are always 32 bytes.
function timingSafeEqualHex(expected: string, received: string): boolean {
  let difference = 0;
  for (let i = 0; i < expected.length; i += 2) {
    difference |= Number.parseInt(expected.slice(i, i + 2), 16)
      ^ Number.parseInt(received.slice(i, i + 2), 16);
  }
  return difference === 0;
}

async function signatureIsValid(rawBody: string, signature: string): Promise<boolean> {
  if (!HEX_SIGNATURE.test(signature)) return false;

  const currentExpected = await hmacSha256Hex(requiredSecret("RAZORPAY_WEBHOOK_SECRET"), rawBody);
  let valid = timingSafeEqualHex(currentExpected, signature.toLowerCase());

  // Razorpay retries old deliveries after a Dashboard secret rotation using
  // the secret that signed the original delivery. Keep the previous secret
  // only for the documented retry window, then remove it.
  const previousSecret = Deno.env.get("RAZORPAY_WEBHOOK_PREVIOUS_SECRET");
  if (previousSecret) {
    const previousExpected = await hmacSha256Hex(previousSecret, rawBody);
    valid = timingSafeEqualHex(previousExpected, signature.toLowerCase()) || valid;
  }
  return valid;
}

type RazorpayPayment = {
  id?: string;
  order_id?: string;
  amount?: number;
  status?: string;
  captured?: boolean;
};

type RazorpayWebhook = {
  event?: string;
  payload?: { payment?: { entity?: RazorpayPayment } };
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return response(405, { error: "Method not allowed" });

  const signature = request.headers.get("x-razorpay-signature");
  const eventId = request.headers.get("x-razorpay-event-id");
  if (!signature || !eventId) return response(400, { error: "Missing Razorpay webhook headers" });

  // This must be the first and only body read. Do not use request.json(),
  // JSON.stringify(), trimming, or any other transformation before HMAC.
  const rawBody = await request.text();
  try {
    if (!(await signatureIsValid(rawBody, signature))) {
      console.warn("razorpay-webhook: invalid signature", { eventId });
      return response(401, { error: "Invalid signature" });
    }
  } catch (error) {
    console.error("razorpay-webhook: signature configuration failure", error);
    return response(503, { error: "Webhook verification unavailable" });
  }

  let event: RazorpayWebhook;
  try {
    event = JSON.parse(rawBody) as RazorpayWebhook;
  } catch {
    return response(400, { error: "Invalid JSON" });
  }

  // Acknowledge unrelated, authentic events. Configure only payment.captured
  // in Razorpay; this makes out-of-order delivery harmless if other events
  // are enabled later.
  if (event.event !== "payment.captured") return response(204);

  const payment = event.payload?.payment?.entity;
  if (!payment?.id || !payment.order_id || !Number.isSafeInteger(payment.amount)
    || payment.amount <= 0 || (payment.status !== "captured" && payment.captured !== true)) {
    console.error("razorpay-webhook: malformed payment.captured payload", { eventId });
    return response(400, { error: "Invalid payment event" });
  }

  // The database RPC locks the order and atomically records the payment,
  // purchase, and event receipt. It is safe for Razorpay retries and for a
  // concurrent app-side verify-payment request.
  const { error } = await supabaseAdmin.rpc("grant_razorpay_payment", {
    p_event_id: eventId,
    p_razorpay_order_id: payment.order_id,
    p_razorpay_payment_id: payment.id,
    p_amount_paise: payment.amount,
  });

  if (error) {
    console.error("razorpay-webhook: grant failed", {
      eventId,
      code: error.code,
      message: error.message,
    });
    // Non-2xx makes Razorpay retry. Never acknowledge a failed grant.
    return response(500, { error: "Unable to process webhook" });
  }

  console.log("razorpay-webhook: processed", { eventId, paymentId: payment.id });
  return response(204);
});
