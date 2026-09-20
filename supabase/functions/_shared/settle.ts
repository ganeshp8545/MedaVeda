// One settlement path for BOTH verify-payment (client callback / recovery) and
// razorpay-webhook (payment.captured). Nothing here trusts the caller: every
// fact is re-fetched from Razorpay or read from our own database, and the
// grant itself happens inside grant_razorpay_payment() (service_role only,
// row-locked, idempotent on razorpay_payment_id).
import { supabaseAdmin } from "./supabaseAdmin.ts";
import { fetchPayment, fetchRazorpayOrder } from "./razorpay.ts";

export type SettleResult =
  | { ok: true; orderId: string; amountRupees: number }
  | { ok: false; status: number; reason: string };

export async function settleCapturedPayment(params: {
  eventId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
}): Promise<SettleResult> {
  const { eventId, razorpayOrderId, razorpayPaymentId } = params;

  // 1. Our own order row (it stores product_id, amount, razorpay_order_id together
  //    and is immutable after insert).
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, product_id, amount, status, razorpay_order_id")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();
  if (orderErr) return { ok: false, status: 500, reason: "order lookup failed" };
  if (!order) return { ok: false, status: 404, reason: "order not found" };

  const expectedPaise = Math.round(Number(order.amount) * 100);
  if (!Number.isSafeInteger(expectedPaise) || expectedPaise <= 0) {
    return { ok: false, status: 500, reason: "invalid order amount" };
  }

  // 2. The payment, straight from Razorpay: captured, for THIS order, right
  //    amount, right currency.
  const payment = await fetchPayment(razorpayPaymentId);
  if (payment.status !== "captured") return { ok: false, status: 409, reason: "payment not captured" };
  if (payment.order_id !== razorpayOrderId) return { ok: false, status: 400, reason: "payment/order mismatch" };
  if (payment.currency !== "INR") return { ok: false, status: 400, reason: "currency mismatch" };
  if (payment.amount !== expectedPaise) return { ok: false, status: 400, reason: "amount mismatch" };

  // 3. Cross-check the Razorpay ORDER too (what we asked them to charge).
  const rzpOrder = await fetchRazorpayOrder(razorpayOrderId);
  if (rzpOrder.amount !== expectedPaise || rzpOrder.currency !== "INR") {
    return { ok: false, status: 400, reason: "razorpay order amount mismatch" };
  }

  // 4. Atomic, idempotent grant of the product stored on the order row.
  const { error } = await supabaseAdmin.rpc("grant_razorpay_payment", {
    p_event_id: eventId,
    p_razorpay_order_id: razorpayOrderId,
    p_razorpay_payment_id: razorpayPaymentId,
    p_amount_paise: payment.amount,
  });
  if (error) {
    console.error("settle: grant failed", { code: error.code, message: error.message });
    return { ok: false, status: 500, reason: "grant failed" };
  }
  return { ok: true, orderId: order.id, amountRupees: Number(order.amount) };
}
