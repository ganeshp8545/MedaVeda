import { jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  consumeProductPurchase,
  getProductPurchase,
  getVoidedPurchasesPage,
  GoogleApiError,
} from "../_shared/googlePlay.ts";
import { runBounded } from "../_shared/paymentQueue.ts";
import { alertUcb } from "../_shared/ucbAlert.ts";

const BATCH_SIZE = 20;
const CONCURRENCY = 4;
type Phase = "consume" | "reconcile" | "voids";
type Job = { order_id: string; lease_id: string };
type PlayOrder = {
  id: string;
  provider: string;
  status: string;
  play_sku: string | null;
  purchase_token: string | null;
  play_consumption_status: string | null;
};

function authorized(req: Request): boolean {
  const expected = Deno.env.get("PLAY_PAYMENT_CRON_SECRET") ?? "";
  const received = req.headers.get("x-play-payment-cron-secret") ?? "";
  if (expected.length < 32 || received.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  }
  return difference === 0;
}

async function orderFor(job: Job): Promise<PlayOrder | null> {
  const { data, error } = await supabaseAdmin.from("orders")
    .select(
      "id,provider,status,play_sku,purchase_token,play_consumption_status",
    )
    .eq("id", job.order_id).maybeSingle();
  if (error) throw new Error("Play order lookup failed");
  if (!data || data.provider !== "play" || data.status !== "paid") return null;
  if (!data.play_sku || !data.purchase_token) {
    throw new Error("Paid Play order missing SKU or token");
  }
  return data as PlayOrder;
}

async function reverse(token: string): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc("reverse_play_payment", {
    p_purchase_token: token,
  });
  if (error || !data || data.status === "unknown_payment") {
    throw new Error("Play entitlement reversal failed");
  }
}

async function processJob(
  phase: "consume" | "reconcile",
  job: Job,
): Promise<string> {
  let success = false;
  let reason: string | null = null;
  try {
    const order = await orderFor(job);
    if (order) {
      const token = order.purchase_token as string;
      const sku = order.play_sku as string;
      const { data: knownVoid, error: voidError } = await supabaseAdmin.from(
        "play_void_tokens",
      )
        .select("purchase_token").eq("purchase_token", token).maybeSingle();
      if (voidError) throw new Error("Play void token lookup failed");
      if (knownVoid) {
        await reverse(token);
        await alertUcb("Previously voided Play purchase reversed", order.id);
      } else {
        if (phase === "reconcile") {
          const { error } = await supabaseAdmin.from("orders")
            .update({ play_last_attempt_at: new Date().toISOString() })
            .eq("id", order.id).eq("provider", "play").eq("status", "paid").eq(
              "purchase_token",
              token,
            );
          if (error) throw new Error("Could not record Play check attempt");
        }
        const purchase = await getProductPurchase(sku, token);
        if (
          (purchase.productId && purchase.productId !== sku) ||
          (purchase.purchaseToken && purchase.purchaseToken !== token)
        ) {
          throw new Error("Google Play purchase identity mismatch");
        }
        if (purchase.purchaseState === 1 || purchase.refundableQuantity === 0) {
          await reverse(token);
          await alertUcb(
            "Play purchase refunded; entitlement reversed",
            order.id,
          );
        } else if (purchase.purchaseState !== 0) {
          throw new Error("Play purchase is not completed");
        } else if (
          phase === "consume" && order.play_consumption_status !== "consumed"
        ) {
          if (purchase.consumptionState !== 1) {
            try {
              await consumeProductPurchase(sku, token);
            } catch (error) {
              // A concurrent direct verification may have consumed it first.
              if (!(error instanceof GoogleApiError) || error.status !== 409) {
                throw error;
              }
              const fresh = await getProductPurchase(sku, token);
              if (fresh.purchaseState !== 0 || fresh.consumptionState !== 1) {
                throw error;
              }
            }
          }
          const { error } = await supabaseAdmin.from("orders")
            .update({ play_consumption_status: "consumed" })
            .eq("id", order.id).eq("provider", "play").eq("status", "paid").eq(
              "purchase_token",
              token,
            );
          if (error) throw new Error("Could not record Play consumption");
        }
        if (phase === "reconcile") {
          const { error } = await supabaseAdmin.from("orders")
            .update({ play_last_checked_at: new Date().toISOString() })
            .eq("id", order.id).eq("provider", "play").eq("status", "paid").eq(
              "purchase_token",
              token,
            );
          if (error) throw new Error("Could not record Play refund check");
        }
      }
    }
    success = true;
  } catch (error) {
    reason = error instanceof GoogleApiError
      ? `Google Play API ${error.status}`
      : String(error);
    console.error("Play payment job failed", {
      phase,
      orderId: job.order_id,
      error: reason,
    });
  }
  const { data: state, error: finishError } = await supabaseAdmin.rpc(
    "finish_play_payment_job",
    {
      p_kind: phase,
      p_order_id: job.order_id,
      p_lease_id: job.lease_id,
      p_success: success,
      p_error: reason,
    },
  );
  if (finishError || state === "lease_lost") {
    throw new Error("Play job lease lost or finish failed");
  }
  if (state === "parked") {
    await alertUcb("Play payment job parked after retry limit", job.order_id);
  }
  return success ? "done" : state === "parked" ? "parked" : "retry";
}

async function processVoids(): Promise<{ processed: number; state: string }> {
  const { data: claim, error: claimError } = await supabaseAdmin.rpc(
    "claim_play_recovery_cursor",
  );
  if (claimError) throw new Error("Play void cursor claim failed");
  if (!claim?.ok) return { processed: 0, state: "busy" };
  const lease = String(claim.lease_id);
  let processed = 0;
  let success = false;
  let nextPage: string | null = null;
  let reason: string | null = null;
  try {
    const start = Number(claim.start_time_ms);
    const end = Number(claim.end_time_ms);
    if (
      !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start >= end ||
      start < Date.now() - 29 * 86400_000
    ) throw new Error("Play void cursor outside safe Google history");
    const page = await getVoidedPurchasesPage(
      start,
      claim.next_page_token || undefined,
      end,
      40,
    );
    const tokens = [
      ...new Set(
        (page.voidedPurchases ?? [])
          .map((item) => item.purchaseToken).filter((token): token is string =>
            !!token
          ),
      ),
    ];
    if (tokens.length) {
      const { error: recordError } = await supabaseAdmin.rpc(
        "record_play_void_tokens",
        { p_tokens: tokens },
      );
      if (recordError) throw new Error("Could not retain Play void tokens");
      const { data: orders, error } = await supabaseAdmin.from("orders")
        .select("id,purchase_token").eq("provider", "play").eq("status", "paid")
        .in("purchase_token", tokens);
      if (error) throw new Error("Voided Play token lookup failed");
      await runBounded(orders ?? [], CONCURRENCY, async (order) => {
        await reverse(order.purchase_token);
        processed++;
        await alertUcb("Play purchase voided; entitlement reversed", order.id);
      });
    }
    nextPage = page.tokenPagination?.nextPageToken || null;
    success = true;
  } catch (error) {
    reason = error instanceof GoogleApiError
      ? `Google Play API ${error.status}`
      : String(error);
    console.error("Play void sweep failed", reason);
    await alertUcb("Play void sweep failed");
  }
  const { data: state, error: finishError } = await supabaseAdmin.rpc(
    "finish_play_recovery_cursor",
    {
      p_lease_id: lease,
      p_success: success,
      p_next_page_token: nextPage,
      p_error: reason,
    },
  );
  if (finishError || state === "lease_lost") {
    throw new Error("Play void cursor lease lost or finish failed");
  }
  return { processed, state: success ? "done" : "retry" };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  if (!authorized(req)) return jsonResponse({ error: "Unauthorized." }, 401);
  const body = await req.json().catch(() => ({})) as { phase?: unknown };
  const phase = body.phase;
  if (phase !== "consume" && phase !== "reconcile" && phase !== "voids") {
    return jsonResponse({ error: "Invalid Play worker phase." }, 400);
  }
  try {
    if (phase === "voids") {
      const result = await processVoids();
      return jsonResponse({
        ok: result.state === "done" || result.state === "busy",
        phase,
        ...result,
      }, result.state === "retry" ? 503 : 200);
    }
    const { error: enqueueError } = await supabaseAdmin.rpc(
      "enqueue_play_payment_jobs",
    );
    if (enqueueError) throw new Error("Play job enqueue failed");
    const { data: jobs, error: claimError } = await supabaseAdmin.rpc(
      "claim_play_payment_jobs",
      {
        p_kind: phase,
        p_limit: BATCH_SIZE,
      },
    );
    if (claimError) throw new Error("Play job claim failed");
    const counts = { done: 0, retry: 0, parked: 0, failed: 0 };
    await runBounded((jobs ?? []) as Job[], CONCURRENCY, async (job) => {
      try {
        counts[await processJob(phase, job) as "done" | "retry" | "parked"]++;
      } catch (error) {
        counts.failed++;
        console.error("Play job completion failed", String(error));
      }
    });
    const { data: metrics, error: metricsError } = await supabaseAdmin.from(
      "play_recovery_metrics",
    )
      .select(
        "backlog_count,parked_count,oldest_job_at,cursor_lag_seconds,cursor_failures",
      ).maybeSingle();
    if (metricsError) throw new Error("Play recovery metrics unavailable");
    if (
      metrics &&
      (Number(metrics.parked_count) > 0 ||
        Number(metrics.cursor_lag_seconds) > 3600 ||
        (metrics.oldest_job_at &&
          Date.parse(metrics.oldest_job_at) < Date.now() - 2 * 3600_000))
    ) {
      await alertUcb("Play recovery backlog requires attention");
    }
    return jsonResponse({
      ok: counts.retry === 0 && counts.parked === 0 && counts.failed === 0,
      phase,
      claimed: (jobs ?? []).length,
      ...counts,
    }, counts.retry || counts.parked || counts.failed ? 503 : 200);
  } catch (error) {
    console.error("Play worker unavailable", String(error));
    return jsonResponse({ error: "Play worker unavailable." }, 503);
  }
});
