// Client callback verifier. Webhooks remain the authoritative recovery path;
// both paths use the same atomic SQL grant to prevent split-brain purchases.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { verifyPaymentSignature, fetchCapturedPaymentForOrder } from "../_shared/razorpay.ts";

async function grantVerifiedPayment(params: {
  order: Record<string, unknown>;
  razorpayOrderId: string;
  razorpayPaymentId: string;
}): Promise<Response> {
  const amount = Number(params.order.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return jsonResponse({ error: "Invalid order amount." }, 500);
  }

  const { error } = await supabaseAdmin.rpc("grant_razorpay_payment", {
    // A client callback has no Razorpay event id. Its deterministic receipt
    // remains distinct from a later real webhook event and is idempotent.
    p_event_id: `client:${params.razorpayPaymentId}`,
    p_razorpay_order_id: params.razorpayOrderId,
    p_razorpay_payment_id: params.razorpayPaymentId,
    p_amount_paise: Math.round(amount * 100),
  });

  if (error) {
    console.error("verify-payment: atomic grant failed", { code: error.code, message: error.message });
    return jsonResponse({ error: "Something went wrong verifying your payment." }, 500);
  }

  return jsonResponse({
    success: true,
    title: "Payment Successful",
    message: "Your content is now unlocked.",
    amount,
    orderId: params.order.id,
  });
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const internalOrderId = typeof body.internalOrderId === "string" ? body.internalOrderId : "";
    const recover = body.recover === true;
    if (!internalOrderId) return jsonResponse({ error: "Missing payment details for verification." }, 400);

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", internalOrderId)
      .maybeSingle();
    if (orderError || !order) return jsonResponse({ error: "Order not found. Please contact support." }, 404);

    if (recover) {
      if (!order.razorpay_order_id) return jsonResponse({ success: false, message: "Payment not started yet." });
      const captured = await fetchCapturedPaymentForOrder(order.razorpay_order_id);
      if (!captured) return jsonResponse({ success: false, message: "Payment not completed yet." });
      return grantVerifiedPayment({
        order,
        razorpayOrderId: order.razorpay_order_id,
        razorpayPaymentId: captured.id,
      });
    }

    const razorpayOrderId = typeof body.razorpay_order_id === "string" ? body.razorpay_order_id : "";
    const razorpayPaymentId = typeof body.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
    const razorpaySignature = typeof body.razorpay_signature === "string" ? body.razorpay_signature : "";
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return jsonResponse({ error: "Missing payment details for verification." }, 400);
    }

    const signatureValid = await verifyPaymentSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });
    if (!signatureValid || order.razorpay_order_id !== razorpayOrderId) {
      console.warn("verify-payment: signature/order mismatch", { internalOrderId, razorpayPaymentId });
      return jsonResponse({ success: false, message: "Payment verification failed." }, 400);
    }

    return grantVerifiedPayment({ order, razorpayOrderId, razorpayPaymentId });
  } catch (error) {
    console.error("verify-payment: unhandled error", error);
    return jsonResponse({ error: "Something went wrong verifying your payment." }, 500);
  }
});
