import { jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { reportExternalRefundEvent, reportExternalOrder } from "../_shared/externalReporting.ts";
import { consumeProductPurchase, getProductPurchase, getVoidedPurchasesPage } from "../_shared/googlePlay.ts";
import { alertUcb } from "../_shared/ucbAlert.ts";
import { settleRefund, settleDispute } from "../_shared/settle.ts";
import { refundCapturedPayment } from "../_shared/razorpay.ts";
import { runBounded, WORK_BATCH_SIZE, WORK_CONCURRENCY } from "../_shared/paymentQueue.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authorized(req: Request): boolean {
  const expected = Deno.env.get("UCB_REPORT_CRON_SECRET") ?? "";
  const received = req.headers.get("x-ucb-cron-secret") ?? "";
  if (expected.length < 32 || received.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  if (!authorized(req)) return jsonResponse({ error: "Unauthorized." }, 401);
  const body = await req.json().catch(() => ({})) as { orderId?: unknown; phase?: unknown };
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (orderId && !UUID.test(orderId)) return jsonResponse({ error: "Invalid orderId." }, 400);
  const phase = typeof body.phase === "string" ? body.phase : (orderId ? "reports" : "");
  if (!["reports", "refunds", "consume", "reconcile", "compensate", "events"].includes(phase) ||
      (orderId && phase !== "reports")) return jsonResponse({ error: "Invalid sweep phase." }, 400);
  const failed: string[] = [];
  let reported = 0;
  const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_payment_jobs");
  if (enqueueError) return jsonResponse({ error: "Payment queue unavailable." }, 503);
  const { data: claims, error: claimJobsError } = orderId
    ? { data: [{ target_id: orderId, lease_id: null }], error: null }
    : await supabaseAdmin.rpc("claim_payment_jobs", { p_kind: phase, p_limit: WORK_BATCH_SIZE });
  if (claimJobsError) return jsonResponse({ error: "Payment job claim unavailable." }, 503);
  const jobs = (claims ?? []) as { target_id: string; lease_id: string | null }[];
  const processJob = async (job: { target_id: string; lease_id: string | null }) => {
    const id = job.target_id;
    let success = false;
    let reason = "";
    try {
      if (phase === "reports") {
        if (await reportExternalOrder(id) === "reported") reported++;
      } else if (phase === "refunds") {
        await reportExternalRefundEvent(id);
      } else if (phase === "consume") {
        const { data: item, error } = await supabaseAdmin.from("orders")
          .select("id,play_sku,purchase_token").eq("id", id).maybeSingle();
        if (error || !item?.play_sku || !item.purchase_token) throw new Error("Missing settled Play token/SKU");
        const purchase = await getProductPurchase(item.play_sku, item.purchase_token);
        if (purchase.purchaseState !== 0 || purchase.refundableQuantity === 0)
          throw new Error("Play purchase no longer purchased");
        if (purchase.consumptionState !== 1) await consumeProductPurchase(item.play_sku, item.purchase_token);
        const { error: updateError } = await supabaseAdmin.from("orders")
          .update({ play_consumption_status: "consumed" }).eq("id", id).eq("purchase_token", item.purchase_token);
        if (updateError) throw new Error("Could not record Play consumption");
      } else if (phase === "reconcile") {
        const { data: item, error } = await supabaseAdmin.from("orders")
          .select("id,play_sku,purchase_token").eq("id", id).maybeSingle();
        if (error || !item?.play_sku || !item.purchase_token) throw new Error("Play order unavailable");
        const { error: attemptError } = await supabaseAdmin.from("orders")
          .update({ play_last_attempt_at: new Date().toISOString() }).eq("id", id);
        if (attemptError) throw new Error("Could not record Play check attempt");
        const purchase = await getProductPurchase(item.play_sku, item.purchase_token);
        if (purchase.purchaseState === 1 || purchase.refundableQuantity === 0) {
          const { error: reverseError } = await supabaseAdmin.rpc("reverse_play_payment", {
            p_purchase_token: item.purchase_token });
          if (reverseError) throw new Error("Play refund entitlement reversal failed");
          await alertUcb("Play purchase refunded or voided; access revoked", id);
        } else if (purchase.purchaseState !== 0) throw new Error("Unexpected Play purchase state");
        const { error: checkError } = await supabaseAdmin.from("orders")
          .update({ play_last_checked_at: new Date().toISOString() }).eq("id", id);
        if (checkError) throw new Error("Could not record Play refund check");
      } else if (phase === "compensate") {
        const { data: item, error } = await supabaseAdmin.from("payment_compensations")
          .select("payment_id,order_id,amount_paise,refund_request_id,provider_refund_id")
          .eq("payment_id", id).maybeSingle();
        if (error || !item) throw new Error("Compensation unavailable");
        const refund = await refundCapturedPayment(item.payment_id, item.amount_paise,
          item.refund_request_id, item.provider_refund_id);
        const { error: updateError } = await supabaseAdmin.from("payment_compensations")
          .update({ status: "refunded", provider_refund_id: refund.id }).eq("payment_id", id);
        if (updateError) throw new Error("Could not record provider refund");
        await supabaseAdmin.from("payment_captures").update({ status: "compensated" }).eq("payment_id", id);
        const handled = await settleRefund({ razorpayPaymentId: id, razorpayRefundId: refund.id });
        if (!handled.ok) throw new Error(handled.reason);
      } else if (phase === "events") {
        const { data: event, error } = await supabaseAdmin.from("provider_events")
          .select("event_id,event_type,payment_id,provider_object_id").eq("event_id", id).maybeSingle();
        if (error || !event) throw new Error("Provider event unavailable");
        if (event.event_type === "refund.processed") {
          if (!event.payment_id || !event.provider_object_id) throw new Error("Refund event incomplete");
          const outcome = await settleRefund({ eventId: id,
            razorpayPaymentId: event.payment_id, razorpayRefundId: event.provider_object_id });
          if (!outcome.ok || outcome.outcome === "unknown_payment") throw new Error("Refund event not linked");
        } else {
          if (!event.provider_object_id) throw new Error("Dispute event incomplete");
          const outcome = await settleDispute({ eventId: id, disputeId: event.provider_object_id });
          if (!outcome.ok || outcome.outcome === "unknown_payment") throw new Error("Dispute event not linked");
        }
      }
      success = true;
    } catch (error) {
      reason = String(error);
      console.error("Payment job failed", { phase, targetId: id, error: reason });
      failed.push(id);
    }
    if (job.lease_id) {
      const { data: state, error: finishError } = await supabaseAdmin.rpc("finish_payment_job", {
        p_kind: phase, p_target_id: id, p_lease_id: job.lease_id,
        p_success: success, p_error: reason || null,
      });
      if (finishError) failed.push(id);
      if (state === "parked") await alertUcb("Payment job permanently parked", id);
    }
  };
  if (phase === "reconcile") {
  // A leased, durable page cursor resumes after crashes and outages. Google
  // exposes at most 30 days, so the separate paid-token scan covers older gaps.
  const { data: claim, error: claimError } = await supabaseAdmin.rpc("claim_play_void_sweep");
  if (claimError) return jsonResponse({ error: "Void cursor unavailable." }, 503);
  if (claim?.ok) {
    const lease = String(claim.lease_id);
    let startTime = Number(claim.start_time_ms);
    const endTime = Number(claim.end_time_ms);
    let nextPage: string | undefined = claim.next_page_token || undefined;
    if (startTime < Date.now() - 29 * 86400_000 && !nextPage) {
      await alertUcb("UCB void cursor exceeded Google 30-day history", "reconcile");
      startTime = Date.now() - 29 * 86400_000;
    }
    try {
      for (let pageNumber = 0; pageNumber < 3; pageNumber++) {
        const page = await getVoidedPurchasesPage(startTime, nextPage, endTime);
        const tokens = [...new Set((page.voidedPurchases ?? [])
          .map((item) => item.purchaseToken).filter((token): token is string => !!token))];
        for (let index = 0; index < tokens.length; index += 100) {
          const { data: paid, error: lookupError } = await supabaseAdmin.from("orders")
            .select("id,purchase_token").eq("provider", "play").eq("status", "paid")
            .in("purchase_token", tokens.slice(index, index + 100));
          if (lookupError) throw new Error("Voided Play order lookup failed");
          for (const order of paid ?? []) {
            const { error: reverseError } = await supabaseAdmin.rpc("reverse_play_payment", {
              p_purchase_token: order.purchase_token,
            });
            if (reverseError) throw new Error("Voided Play entitlement reversal failed");
            await alertUcb("Play purchase voided; access revoked", order.id);
          }
        }
        nextPage = page.tokenPagination?.nextPageToken || undefined;
        const finished = !nextPage;
        const { error: cursorError } = await supabaseAdmin.from("play_void_sweep_state")
          .update(finished ? {
            start_time_ms: Math.max(startTime, endTime - 3600_000),
            end_time_ms: Date.now(), next_page_token: null,
            lease_id: null, lease_until: null, updated_at: new Date().toISOString(),
          } : { start_time_ms: startTime, next_page_token: nextPage,
            updated_at: new Date().toISOString() })
          .eq("id", true).eq("lease_id", lease);
        if (cursorError) throw new Error("Could not persist void cursor");
        if (finished) break;
      }
      if (nextPage) {
        const { error: releaseError } = await supabaseAdmin.from("play_void_sweep_state")
          .update({ lease_id: null, lease_until: null }).eq("id", true).eq("lease_id", lease);
        if (releaseError) throw new Error("Could not release void cursor lease");
      }
    } catch (error) {
      console.error("UCB voided purchase sweep failed", String(error));
      await alertUcb("UCB voided purchase sweep failed", "reconcile");
      failed.push("voided-purchases");
    }
  }
  const { data: metrics, error: metricsError } = await supabaseAdmin.from("play_void_sweep_metrics")
    .select("unchecked_count,oldest_unchecked_at,cursor_lag_seconds").maybeSingle();
  if (metricsError || !metrics) return jsonResponse({ error: "Void backlog metric unavailable." }, 503);
  if (Number(metrics.unchecked_count) > 0 && metrics.oldest_unchecked_at &&
      Date.parse(metrics.oldest_unchecked_at) < Date.now() - 2 * 3600_000)
    await alertUcb("Oldest paid Play purchase unchecked for over 2 hours", "reconcile");
  if (Number(metrics.cursor_lag_seconds) > 3600)
    await alertUcb("Play void sweep cursor over 1 hour behind", "reconcile");
  // Independently poll paid Play tokens for refunds without revocation and
  // for records outside the API's rolling window.
  }
  await runBounded(jobs, WORK_CONCURRENCY, processJob);
  const { data: queueMetrics } = await supabaseAdmin.from("payment_queue_metrics")
    .select("kind,backlog_count,oldest_queued_at,oldest_deadline_at,estimated_drain_seconds,parked_count")
    .eq("kind", phase).maybeSingle();
  if (queueMetrics && (Number(queueMetrics.parked_count) > 0
      || Number(queueMetrics.estimated_drain_seconds) > 20 * 3600
      || (queueMetrics.oldest_queued_at && Date.parse(queueMetrics.oldest_queued_at) < Date.now() - 20 * 3600_000)
      || (phase !== "reconcile" && queueMetrics.oldest_deadline_at
          && Date.parse(queueMetrics.oldest_deadline_at) < Date.now() + 4 * 3600_000)))
    await alertUcb("Payment queue backlog or drain estimate threatens deadline", phase);
  return jsonResponse({ ok: failed.length === 0, phase, reported, failedCount: failed.length }, failed.length ? 503 : 200);
});
