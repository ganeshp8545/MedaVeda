import { settleCapturedPayment, settleDispute, settleRefund } from "../_shared/settle.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const encoder = new TextEncoder();
const HEX_SIGNATURE = /^[0-9a-f]{64}$/i;
const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,32}$/;
const ORDER_ID = /^order_[A-Za-z0-9]{6,32}$/;
const DISPUTE_ID = /^disp_[A-Za-z0-9]{6,32}$/;
const DISPUTE_EVENTS = new Set([
  "payment.dispute.created",
  "payment.dispute.under_review",
  "payment.dispute.action_required",
  "payment.dispute.won",
  "payment.dispute.lost",
  "payment.dispute.closed",
]);

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
  created_at?: number;
  payload?: {
    payment?: { entity?: RazorpayPayment };
    refund?: { entity?: { id?: string; payment_id?: string } };
    dispute?: { entity?: { id?: string; payment_id?: string; status?: string } };
  };
};

type ValidatedPayment = { id: string; orderId: string; amountPaise: number };

// Narrows the untrusted webhook entity to the fields settlement relies on.
// Anything missing or malformed is rejected here, before settlement is reached.
function parseCapturedPayment(
  entity: RazorpayPayment | undefined
): ({ ok: true } & ValidatedPayment) | { ok: false; problem: string } {
  if (!entity || typeof entity !== "object") return { ok: false, problem: "missing payment entity" };

  const { id, order_id: orderId, amount, status, captured } = entity;
  if (typeof id !== "string" || !PAYMENT_ID.test(id)) return { ok: false, problem: "missing or malformed payment id" };
  if (typeof orderId !== "string" || !ORDER_ID.test(orderId)) return { ok: false, problem: "missing or malformed order id" };
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
    return { ok: false, problem: "missing or invalid amount" };
  }
  if (status !== "captured" && captured !== true) return { ok: false, problem: "payment not captured" };

  return { ok: true, id, orderId, amountPaise: amount };
}

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

  // Durable authenticated inbox: commit before any provider lookup or grant.
  // Razorpay's top-level event time on payment.captured denotes the capture
  // event; payment.entity.created_at denotes payment creation instead.
  const hashBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(rawBody)));
  const payloadHash = Array.from(hashBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const entity = event.payload?.payment?.entity;
  const eventPaymentId = event.payload?.refund?.entity?.payment_id
    ?? event.payload?.dispute?.entity?.payment_id ?? entity?.id ?? null;
  const objectId = event.payload?.refund?.entity?.id
    ?? event.payload?.dispute?.entity?.id ?? null;
  const providerTime = event.event === "payment.captured"
    && Number.isSafeInteger(event.created_at) && (event.created_at as number) > 0
    ? new Date((event.created_at as number) * 1000).toISOString() : null;
  const { error: inboxError } = await supabaseAdmin.rpc("record_provider_event", {
    p_event_id: eventId, p_event_type: event.event ?? "unknown",
    p_razorpay_order_id: entity?.order_id ?? null,
    p_payment_id: eventPaymentId, p_provider_object_id: objectId,
    p_payload_hash: payloadHash, p_provider_time: providerTime,
  });
  if (inboxError) return response(503, { error: "Webhook inbox unavailable" });

  // refund.processed: cancels the referrer's credit if it is still in its hold.
  // Enable this event in the Razorpay Dashboard webhook alongside payment.captured.
  if (event.event === "refund.processed") {
    const refundPaymentId = event.payload?.refund?.entity?.payment_id ?? event.payload?.payment?.entity?.id;
    const refundId = event.payload?.refund?.entity?.id;
    if (!refundPaymentId || typeof refundId !== "string" || !/^rfnd_[A-Za-z0-9]+$/.test(refundId)) {
      console.error("razorpay-webhook: malformed refund.processed payload", { eventId });
      return response(400, { error: "Invalid refund event" });
    }
    try {
      const refund = await settleRefund({ razorpayPaymentId: refundPaymentId, razorpayRefundId: refundId, eventId });
      if (!refund.ok) return response(500, { error: "Unable to process webhook" }); // Razorpay retries
      console.log("razorpay-webhook: refund processed", { eventId, paymentId: refundPaymentId, outcome: refund.outcome });
      return response(204);
    } catch (error) {
      console.error("razorpay-webhook: refund error", { eventId, error: String(error) });
      return response(500, { error: "Unable to process webhook" });
    }
  }

  // payment.dispute.*: a chargeback suspends access while open, restores it if
  // won and reverses the purchase if lost. Enable these events in the Razorpay
  // Dashboard webhook. The dispute is re-fetched from Razorpay (settleDispute).
  if (event.event && DISPUTE_EVENTS.has(event.event)) {
    const disputeId = event.payload?.dispute?.entity?.id;
    if (typeof disputeId !== "string" || !DISPUTE_ID.test(disputeId)) {
      console.error("razorpay-webhook: malformed dispute payload", { eventId, event: event.event });
      return response(400, { error: "Invalid dispute event" });
    }
    try {
      const dispute = await settleDispute({ disputeId, eventId });
      if (!dispute.ok) return response(500, { error: "Unable to process webhook" }); // Razorpay retries
      console.log("razorpay-webhook: dispute processed", { eventId, disputeId, event: event.event, outcome: dispute.outcome });
      return response(204);
    } catch (error) {
      console.error("razorpay-webhook: dispute error", { eventId, error: String(error) });
      return response(500, { error: "Unable to process webhook" });
    }
  }

  // Acknowledge unrelated, authentic events. Everything except payment.captured,
  // refund.processed and payment.dispute.* is ignored, so out-of-order delivery is harmless.
  if (event.event !== "payment.captured") {
    const { error: ignoredError } = await supabaseAdmin.from("provider_events")
      .update({ status: "applied" }).eq("event_id", eventId);
    return ignoredError ? response(503, { error: "Webhook inbox unavailable" }) : response(204);
  }

  const payment = parseCapturedPayment(event.payload?.payment?.entity);
  if (!payment.ok) {
    console.error("razorpay-webhook: malformed payment.captured payload", { eventId, problem: payment.problem });
    return response(400, { error: `Invalid payment event: ${payment.problem}` });
  }

  // Same settlement path as verify-payment: re-fetch the payment from Razorpay,
  // check captured / order / currency / amount against our order row, then the
  // atomic idempotent grant. Safe for Razorpay retries and for a concurrent
  // app-side verify-payment request.
  let result;
  try {
    result = await settleCapturedPayment({
      eventId,
      razorpayOrderId: payment.orderId,
      razorpayPaymentId: payment.id,
      providerTime,
    });
  } catch (error) {
    console.error("razorpay-webhook: settlement error", { eventId, error: String(error) });
    return response(500, { error: "Unable to process webhook" }); // Razorpay retries
  }

  if (!result.ok) {
    console.error("razorpay-webhook: not settled", { eventId, paymentId: payment.id, reason: result.reason });
    // Permanent rejections (unknown order, mismatch) are acknowledged so Razorpay
    // stops retrying; they are logged for manual review. Transient failures
    // (5xx-class, not-yet-captured) return non-2xx so Razorpay retries.
    if (result.status === 404 || result.status === 400
        || (result.status === 409 && ["payment captured; refund queued", "payment already refunded"].includes(result.reason)))
      return response(204);
    return response(500, { error: "Unable to process webhook" });
  }

  console.log("razorpay-webhook: processed", { eventId, paymentId: payment.id });
  return response(204);
});
