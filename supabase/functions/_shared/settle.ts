// One settlement path for BOTH verify-payment (client callback / recovery) and
// razorpay-webhook (payment.captured). Nothing here trusts the caller: every
// fact is re-fetched from Razorpay or read from our own database, and the
// grant itself happens inside settle_razorpay_payment() (service_role only,
// row-locked, idempotent on razorpay_payment_id). That one transaction also
// debits the wallet amount stored on the order and creates the referrer's
// pending credit, so a payment that never captures never moves any money in
// the wallet.
import { supabaseAdmin } from "./supabaseAdmin.ts";
import { fetchDispute, fetchPayment, fetchRazorpayOrder, fetchRefund } from "./razorpay.ts";
import { reportExternalOrder, reportExternalRefundEvent } from "./externalReporting.ts";
import { alertUcb } from "./ucbAlert.ts";

export type SettleResult =
  | { ok: true; orderId: string; amountRupees: number }
  | { ok: false; status: number; reason: string };

export async function settleCapturedPayment(params: {
  eventId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  providerTime?: string | null;
}): Promise<SettleResult> {
  const { eventId, razorpayOrderId, razorpayPaymentId } = params;

  // 1. Verify the provider's payment and order, then record the capture even
  //    when our local order is missing or later entitlement checks refuse it.
  const payment = await fetchPayment(razorpayPaymentId);
  const alreadyRefunded = payment.status === "refunded"
    && (payment.refund_status === "full" || payment.amount_refunded === payment.amount);
  if (payment.status !== "captured" && !alreadyRefunded)
    return { ok: false, status: 409, reason: "payment not captured" };
  if (payment.order_id !== razorpayOrderId) return { ok: false, status: 400, reason: "payment/order mismatch" };
  if (payment.currency !== "INR") return { ok: false, status: 400, reason: "currency mismatch" };
  if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0)
    return { ok: false, status: 400, reason: "invalid provider amount" };
  const rzpOrder = await fetchRazorpayOrder(razorpayOrderId);
  if (rzpOrder.amount !== payment.amount || rzpOrder.currency !== "INR") {
    return { ok: false, status: 400, reason: "razorpay order amount mismatch" };
  }

  // This independent write survives a later entitlement refusal. The provider
  // time comes only from the authenticated payment.captured event envelope.
  const { error: captureError } = await supabaseAdmin.rpc("record_payment_capture", {
    p_payment_id: razorpayPaymentId, p_razorpay_order_id: razorpayOrderId,
    p_amount_paise: payment.amount, p_provider_time: params.providerTime ?? null,
  });
  if (captureError) return { ok: false, status: 500, reason: "capture record failed" };
  if (alreadyRefunded) {
    const { error: reversedError } = await supabaseAdmin.from("payment_captures")
      .update({ status: "reversed", failure_reason: "provider_already_refunded" })
      .eq("payment_id", razorpayPaymentId);
    if (reversedError) return { ok: false, status: 500, reason: "capture reversal record failed" };
  }

  // 2. The local order supplies the immutable product and charged-price
  //    snapshot. A missing or mismatched row cannot be entitled.
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, product_id, amount, status, razorpay_order_id, external_transaction_token")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();
  if (orderErr) return { ok: false, status: 500, reason: "order lookup failed" };
  const expectedPaise = order ? Math.round(Number(order.amount) * 100) : null;
  if (!order || expectedPaise !== payment.amount) {
    if (!alreadyRefunded) {
      const { error: compensationError } = await supabaseAdmin.from("payment_compensations")
        .upsert({ payment_id: razorpayPaymentId, order_id: order?.id ?? null,
          amount_paise: payment.amount, reason: order ? "amount_mismatch" : "unknown_order",
          refund_request_id: `medveda_comp_${razorpayPaymentId}` },
          { onConflict: "payment_id", ignoreDuplicates: true });
      if (compensationError) return { ok: false, status: 500, reason: "compensation queue failed" };
      const { error: stateError } = await supabaseAdmin.from("payment_captures")
        .update({ status: "compensation_pending", failure_reason: order ? "amount_mismatch" : "unknown_order" })
        .eq("payment_id", razorpayPaymentId);
      if (stateError) return { ok: false, status: 500, reason: "capture status update failed" };
    }
    await alertUcb("Captured Razorpay payment has no matching priced order", order?.id ?? razorpayPaymentId);
    return { ok: false, status: 409, reason: alreadyRefunded
      ? "payment already refunded" : "payment captured; refund queued" };
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
    if (error.message?.includes("wallet shortfall"))
      await alertUcb("Captured Razorpay payment blocked by wallet shortfall", order.id);
    return { ok: false, status: 500, reason: "grant failed" };
  }
  const { data: capture, error: captureStatusError } = await supabaseAdmin.from("payment_captures")
    .select("status,failure_reason").eq("payment_id", razorpayPaymentId).maybeSingle();
  if (captureStatusError || !capture) return { ok: false, status: 500, reason: "capture status unavailable" };
  if (capture.status !== "granted") {
    await alertUcb("Captured Razorpay payment requires compensation or reversal", order.id);
    if (order.external_transaction_token) {
      try { await reportExternalOrder(order.id); }
      catch (reportError) { console.error("settle: UCB rejected capture report queued", String(reportError)); }
    }
    return { ok: false, status: 409, reason: "payment captured; refund queued" };
  }
  if (order.external_transaction_token) {
    const { data: completed, error: timestampError } = await supabaseAdmin.from("orders")
      .select("payment_completed_at,payment_provider_time,payment_time_fallback").eq("id", order.id).maybeSingle();
    if (timestampError || !completed?.payment_completed_at) {
      console.error("settle: UCB completion timestamp missing", timestampError?.code);
      return { ok: false, status: 500, reason: "completion timestamp missing" };
    }
    if (!completed.payment_provider_time || completed.payment_time_fallback)
      await alertUcb("UCB capture time missing; using receipt-time fallback", order.id);
    try { await reportExternalOrder(order.id); }
    catch (reportError) { console.error("settle: UCB report queued for retry", String(reportError)); }
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
export async function settleRefund(params: { razorpayPaymentId: string; razorpayRefundId: string; eventId?: string }): Promise<RefundResult> {
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
  const { data: order, error: orderError } = await supabaseAdmin.from("orders")
    .select("id,amount,tax_pre_amount,external_transaction_token")
    .eq("razorpay_payment_id", params.razorpayPaymentId).maybeSingle();
  if (orderError) return { ok: false, status: 500, reason: "Refund order lookup failed" };
  if (order?.external_transaction_token) {
    const refund = await fetchRefund(params.razorpayRefundId);
    if (refund.payment_id !== payment.id || refund.status !== "processed" || refund.currency !== "INR"
        || !Number.isSafeInteger(refund.amount) || refund.amount <= 0 || refund.amount > payment.amount
        || !Number.isSafeInteger(refund.created_at) || refund.created_at <= 0)
      return { ok: false, status: 400, reason: "Razorpay refund mismatch" };
    const originalPaise = Math.round(Number(order.amount) * 100);
    const originalPrePaise = Math.round(Number(order.tax_pre_amount) * 100);
    const preTaxPaise = Math.round(refund.amount * originalPrePaise / originalPaise);
    if (!Number.isSafeInteger(preTaxPaise) || preTaxPaise <= 0 ||
        !Number.isSafeInteger(originalPaise) || originalPaise <= 0) {
      return { ok: false, status: 500, reason: "Refund tax snapshot unavailable" };
    }
    const { error: queueError } = await supabaseAdmin.from("ucb_external_refunds").upsert({
      refund_id: refund.id, order_id: order.id, amount_paise: refund.amount,
      pre_tax_paise: preTaxPaise, refund_time: new Date(refund.created_at * 1000).toISOString(),
      // A payment may already have several processed partial refunds when an
      // older webhook arrives. Mark only this event's own amount as full;
      // reportExternalRefundEvent adds the earlier reported amounts itself.
      is_full: refund.amount >= originalPaise,
    }, { onConflict: "refund_id", ignoreDuplicates: true });
    if (queueError) return { ok: false, status: 500, reason: "Cannot queue Google refund report" };
    try { await reportExternalRefundEvent(refund.id); }
    catch (reportError) { console.error("settle: UCB refund report queued for retry", String(reportError)); }
  }
  const outcome = String((data as { status?: string } | null)?.status ?? "unknown");
  if (params.eventId && outcome !== "unknown_payment") {
    const { error: inboxError } = await supabaseAdmin.from("provider_events")
      .update({ status: "applied" }).eq("event_id", params.eventId);
    if (inboxError) return { ok: false, status: 500, reason: "refund inbox update failed" };
  }
  return { ok: true, outcome };
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

export async function settleDispute(params: { disputeId: string; eventId?: string }): Promise<RefundResult> {
  const dispute = await fetchDispute(params.disputeId);
  if (typeof dispute.payment_id !== "string" || !dispute.payment_id.startsWith("pay_")) {
    return { ok: false, status: 400, reason: "dispute has no payment" };
  }
  const outcome = disputeOutcome(dispute.status);
  if (!outcome) {
    if (params.eventId) {
      const { error: inboxError } = await supabaseAdmin.from("provider_events")
        .update({ status: "applied" }).eq("event_id", params.eventId);
      if (inboxError) return { ok: false, status: 500, reason: "dispute inbox update failed" };
    }
    return { ok: true, outcome: `no_change_status_${String(dispute.status)}` };
  }

  const { data, error } = await supabaseAdmin.rpc("handle_payment_dispute", {
    p_razorpay_payment_id: dispute.payment_id,
    p_outcome: outcome,
  });
  if (error) {
    console.error("settle: dispute handling failed", { code: error.code, message: error.message });
    return { ok: false, status: 500, reason: "dispute handling failed" };
  }
  if (outcome === "lost") {
    const { data: order, error: orderError } = await supabaseAdmin.from("orders")
      .select("id,amount,tax_pre_amount,external_transaction_token")
      .eq("razorpay_payment_id", dispute.payment_id).maybeSingle();
    if (orderError) return { ok: false, status: 500, reason: "Dispute order lookup failed" };
    if (order?.external_transaction_token) {
      const amountPaise = Math.round(Number(order.amount) * 100);
      const preTaxPaise = Math.round(Number(order.tax_pre_amount) * 100);
      if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 ||
          !Number.isSafeInteger(preTaxPaise) || preTaxPaise <= 0)
        return { ok: false, status: 500, reason: "Dispute tax snapshot unavailable" };
      const refundId = `dispute_${dispute.id}`;
      const { error: queueError } = await supabaseAdmin.from("ucb_external_refunds").upsert({
        refund_id: refundId, order_id: order.id, amount_paise: amountPaise,
        pre_tax_paise: preTaxPaise, refund_time: new Date().toISOString(), is_full: true,
      }, { onConflict: "refund_id", ignoreDuplicates: true });
      if (queueError) return { ok: false, status: 500, reason: "Cannot queue dispute report" };
      try { await reportExternalRefundEvent(refundId); }
      catch (reportError) { console.error("settle: UCB dispute report queued for retry", String(reportError)); }
    }
  }
  const applied = String((data as { status?: string } | null)?.status ?? "unknown");
  if (params.eventId && applied !== "unknown_payment") {
    const { error: inboxError } = await supabaseAdmin.from("provider_events")
      .update({ status: "applied" }).eq("event_id", params.eventId);
    if (inboxError) return { ok: false, status: 500, reason: "dispute inbox update failed" };
  }
  return { ok: true, outcome: applied };
}
