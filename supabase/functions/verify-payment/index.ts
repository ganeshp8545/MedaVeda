// Client callback verifier (POST). Grants access ONLY after:
//   a) HMAC-SHA256(razorpay_order_id|razorpay_payment_id, KEY_SECRET) matches
//      (constant-time), and the order id is the one stored on our order row;
//   b) Razorpay itself confirms the payment: captured, same order, same
//      currency, same amount as our DB order (see _shared/settle.ts);
//   c) the grant is idempotent (unique razorpay_payment_id, one purchase/order).
// The razorpay-webhook function uses the same settlement code as a backup path.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { verifyPaymentSignature, fetchCapturedPaymentForOrder } from "../_shared/razorpay.ts";
import { settleCapturedPayment } from "../_shared/settle.ts";
import { clientIp, withinLimit } from "../_shared/rateLimit.ts";
import { paymentGate } from "../_shared/paymentGate.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function settle(razorpayOrderId: string, razorpayPaymentId: string): Promise<Response> {
  try {
    const result = await settleCapturedPayment({
      // No Razorpay event id on a client callback; deterministic and idempotent,
      // and distinct from a later real webhook event id.
      eventId: `client:${razorpayPaymentId}`,
      razorpayOrderId,
      razorpayPaymentId,
    });
    if (!result.ok) {
      console.warn("verify-payment: not settled", { reason: result.reason, razorpayPaymentId });
      return jsonResponse(
        { success: false, message: "Payment could not be verified. If money was debited, it will be confirmed automatically or contact support." },
        result.status >= 500 ? 500 : 400
      );
    }
    return jsonResponse({
      success: true,
      title: "Payment Successful",
      message: "Your content is now unlocked.",
      amount: result.amountRupees,
      orderId: result.orderId,
    });
  } catch (error) {
    console.error("verify-payment: settlement error", error);
    return jsonResponse({ error: "Something went wrong verifying your payment." }, 500);
  }
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const internalOrderId = typeof body.internalOrderId === "string" ? body.internalOrderId : "";
    const recover = body.recover === true;
    if (!internalOrderId || !UUID.test(internalOrderId)) {
      return jsonResponse({ error: "Missing payment details for verification." }, 400);
    }
    const recoveryUser = recover ? await getUserFromAuthHeader(req) : null;
    if (recover && !recoveryUser) return jsonResponse({ error: "Please log in before recovering payment." }, 401);

    // Signed callbacks remain signature-verified; unsigned recovery requires a
    // verified user JWT below. Both paths are abuse-limited because they can
    // trigger Razorpay API requests. Limits are set
    // well above the app's own retry/poll schedule (~90 calls per order over 10 minutes).
    // The per-IP counter is skipped when no client IP is available, so unknown IPs
    // cannot share (and exhaust) one bucket.
    const ip = clientIp(req);
    if (!(await withinLimit(`verify-order:${internalOrderId}`, 150, 600, recover))
        || (ip !== "unknown" && !(await withinLimit(`verify-ip:${ip}`, 600, 600, recover)))) {
      return jsonResponse({ error: "Too many requests. Please wait a moment." }, 429);
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, razorpay_order_id, external_transaction_token")
      .eq("id", internalOrderId)
      .maybeSingle();
    if (orderError || !order) return jsonResponse({ error: "Order not found. Please contact support." }, 404);
    if (recover && order.user_id !== recoveryUser?.id)
      return jsonResponse({ error: "This order does not belong to you." }, 403);
    const gate = await paymentGate(req, !!order.external_transaction_token);
    if (gate !== "allow") return jsonResponse({ error: gate === "upgrade"
      ? "Update the app before verifying payment." : gate === "choice"
      ? "Billing choice is required." : "Billing configuration unavailable." },
      gate === "unavailable" ? 503 : 403);

    if (recover) {
      // No client signature: we ask Razorpay ourselves which payment (if any)
      // was captured for THIS order, then settle it through the same checks.
      if (!order.razorpay_order_id) return jsonResponse({ success: false, message: "Payment not started yet." });
      const captured = await fetchCapturedPaymentForOrder(order.razorpay_order_id);
      if (!captured) return jsonResponse({ success: false, message: "Payment not completed yet." });
      return settle(order.razorpay_order_id, captured.id);
    }

    const razorpayOrderId = typeof body.razorpay_order_id === "string" ? body.razorpay_order_id : "";
    const razorpayPaymentId = typeof body.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
    const razorpaySignature = typeof body.razorpay_signature === "string" ? body.razorpay_signature : "";
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return jsonResponse({ error: "Missing payment details for verification." }, 400);
    }

    const signatureValid = await verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
    if (!signatureValid || order.razorpay_order_id !== razorpayOrderId) {
      console.warn("verify-payment: signature/order mismatch", { internalOrderId, razorpayPaymentId });
      return jsonResponse({ success: false, message: "Payment verification failed." }, 400);
    }

    return settle(razorpayOrderId, razorpayPaymentId);
  } catch (error) {
    console.error("verify-payment: unhandled error", error);
    return jsonResponse({ error: "Something went wrong verifying your payment." }, 500);
  }
});
