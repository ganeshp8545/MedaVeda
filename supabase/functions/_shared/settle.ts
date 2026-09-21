// One settlement path for BOTH verify-payment (client callback / recovery) and
// razorpay-webhook (payment.captured). Nothing here trusts the caller: every
// fact is re-fetched from Razorpay or read from our own database, and the
// grant itself happens inside settle_razorpay_payment() (service_role only,
// row-locked, idempotent on razorpay_payment_id). That one transaction also
// debits the wallet amount stored on the order and creates the referrer's
// pending credit, so a payment that never captures never moves any money in
// the wallet.
import { supabaseAdmin } from "./supabaseAdmin.ts";
import { fetchDispute, fetchPayment, fetchRazorpayOrder } from "./razorpay.ts";

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

  // 4. Atomic, idempotent grant of the product stored on the order row. The
  //    payment's own creation time (from Razorpay, not from the client) lets the
  //    database tell a payment started inside the order's 30-minute life from
  //    one started after it expired; in that case the wallet is not debited and
  //    the order is flagged for admin review (see settle_razorpay_payment).
  const paidAt = Number.isSafeInteger(payment.created_at)
    ? new Date((payment.created_at as number) * 1000).toISOString()
    : null;
  const { error } = await supabaseAdmin.rpc("settle_razorpay_payment", {
    p_event_id: eventId,
    p_razorpay_order_id: razorpayOrderId,
    p_razorpay_payment_id: razorpayPaymentId,
    p_amount_paise: payment.amount,
    p_paid_at: paidAt,
  });
  if (error) {
    console.error("settle: grant failed", { code: error.code, message: error.message });
    return { ok: false, status: 500, reason: "grant failed" };
  }
  return { ok: true, orderId: order.id, amountRupees: Number(order.amount) };
}

export type RefundResult =
  | { ok: true; outcome: string }
  | { ok: false; status: number; reason: string };

// refund.processed webhook -> cancel the referrer's still-pending credit.
// The event payload is NOT trusted: we re-fetch the payment from Razorpay and
// only act on a FULL refund (amount_refunded >= amount). handle_payment_refund()
// is idempotent and only cancels a credit that is still inside its hold window.
export async function settleRefund(params: { razorpayPaymentId: string }): Promise<RefundResult> {
  const payment = await fetchPayment(params.razorpayPaymentId);
  const fullRefund = payment.refund_status === "full"
    || (Number.isSafeInteger(payment.amount_refunded) && (payment.amount_refunded as number) >= payment.amount);

  const { data, error } = await supabaseAdmin.rpc("handle_payment_refund", {
    p_razorpay_payment_id: params.razorpayPaymentId,
    p_full_refund: fullRefund,
  });
  if (error) {
    console.error("settle: refund handling failed", { code: error.code, message: error.message });
    return { ok: false, status: 500, reason: "refund handling failed" };
  }
  return { ok: true, outcome: String((data as { status?: string } | null)?.status ?? "unknown") };
}

// payment.dispute.* webhooks -> suspend / restore / reverse access.
// As with refunds the event payload is NOT trusted beyond the dispute id: the
// dispute is re-fetched from Razorpay and ITS status decides what happens.
//   open / under_review  -> "opened": access suspended while the dispute is open
//   won                  -> "won":    access restored
//   lost                 -> "lost":   money gone - reversed like a full refund
//                                     (the student's wallet amount is NOT given back)
//   closed               -> nothing automatic; logged for a manual decision
//                           (an open dispute stays suspended until someone decides).
export function disputeOutcome(status: string | undefined): "opened" | "won" | "lost" | null {
  if (status === "open" || status === "under_review") return "opened";
  if (status === "won") return "won";
  if (status === "lost") return "lost";
  return null;
}

export async function settleDispute(params: { disputeId: string }): Promise<RefundResult> {
  const dispute = await fetchDispute(params.disputeId);
  if (typeof dispute.payment_id !== "string" || !dispute.payment_id.startsWith("pay_")) {
    return { ok: false, status: 400, reason: "dispute has no payment" };
  }
  const outcome = disputeOutcome(dispute.status);
  if (!outcome) return { ok: true, outcome: `no_change_status_${String(dispute.status)}` };

  const { data, error } = await supabaseAdmin.rpc("handle_payment_dispute", {
    p_razorpay_payment_id: dispute.payment_id,
    p_outcome: outcome,
  });
  if (error) {
    console.error("settle: dispute handling failed", { code: error.code, message: error.message });
    return { ok: false, status: 500, reason: "dispute handling failed" };
  }
  return { ok: true, outcome: String((data as { status?: string } | null)?.status ?? "unknown") };
}
