import { jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { GoogleApiError } from "../_shared/googlePlay.ts";
import { activateBuyOption, createOneTimeProduct, getOneTimeProduct,
  optionNeedsActivation, PlayCatalogConfigurationError, priceCents, verifiedBuyOption } from "../_shared/playCatalog.ts";

type Job = { price_inr: string; candidate_sku: string; purchase_option_id: string; lease_id: string };

function authorized(req: Request): boolean {
  const expected = Deno.env.get("PLAY_CATALOG_CRON_SECRET") ?? "";
  const received = req.headers.get("x-play-catalog-cron-secret") ?? "";
  if (expected.length < 32 || received.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return difference === 0;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.code ?? "database_error"}`);
  return data as T;
}

async function sync(job: Job): Promise<void> {
  if (!await rpc<boolean>("play_price_has_eligible_product", { p_price: job.price_inr }))
    throw new Error("No eligible paid-notes product uses this price");
  const cents = priceCents(job.price_inr);
  let sku = job.candidate_sku;
  let product = await getOneTimeProduct(sku);
  if (product && !verifiedBuyOption(product, sku, job.purchase_option_id, cents) &&
      !optionNeedsActivation(product, sku, job.purchase_option_id, cents)) {
    const { data: previous, error } = await supabaseAdmin.from("play_price_tiers")
      .select("play_sku").eq("play_sku", sku).maybeSingle();
    if (error) throw new Error(`tier_lookup: ${error.code}`);
    // A previously usable SKU may have been changed in Console. Keep old
    // orders intact and reserve a new SKU. Unknown collisions require review.
    if (!previous) throw new Error("Reserved Play SKU conflicts with a different catalog item");
    sku = await rpc<string>("rotate_play_price_sku", {
      p_price: job.price_inr, p_lease: job.lease_id, p_reason: "Play catalog no longer matches verified price or BUY option",
    });
    product = await getOneTimeProduct(sku);
  }
  if (!product) {
    await createOneTimeProduct(sku, job.purchase_option_id, cents);
    product = await getOneTimeProduct(sku, "catalog.readback.created");
  }
  if (product && optionNeedsActivation(product, sku, job.purchase_option_id, cents)) {
    await activateBuyOption(sku, job.purchase_option_id, cents);
    product = await getOneTimeProduct(sku, "catalog.readback.activated");
  }
  if (!product || !verifiedBuyOption(product, sku, job.purchase_option_id, cents))
    throw new Error("Play read-back did not confirm active India BUY option and exact INR price");
  if (!await rpc<boolean>("finish_play_price_sync", {
    p_price: job.price_inr, p_lease: job.lease_id, p_sku: sku, p_option: job.purchase_option_id,
  })) throw new Error("Play sync lease expired before tier activation");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!authorized(req))
    return jsonResponse({ error: "Unauthorized" }, 401);
  try { await rpc<number>("requeue_stale_play_price_sync", {}); }
  catch { return jsonResponse({ error: "Catalog recheck unavailable" }, 503); }
  const { data, error } = await supabaseAdmin.rpc("claim_play_price_sync");
  if (error) return jsonResponse({ error: "Catalog queue unavailable" }, 503);
  const job = (data as Job[] | null)?.[0];
  if (!job) return jsonResponse({ processed: 0 });
  try {
    await sync(job);
    return jsonResponse({ processed: 1, status: "ready" });
  } catch (failure) {
    const status = failure instanceof GoogleApiError ? failure.status : undefined;
    const reason = failure instanceof GoogleApiError ? failure.message :
      failure instanceof Error ? failure.message : "Catalog sync failed";
    const retry = failure instanceof GoogleApiError ? failure.retryable :
      !(failure instanceof PlayCatalogConfigurationError) &&
      !reason.includes("conflicts") && !reason.includes("No eligible paid-notes product");
    if (failure instanceof GoogleApiError) console.error("play_catalog_failure", JSON.stringify({
      operation: failure.operation, status, reason: failure.reason, requestId: failure.requestId,
      details: failure.details,
      jobId: job.price_inr, leaseId: job.lease_id, retryable: retry,
    }));
    try {
      if (!await rpc<boolean>("fail_play_price_sync", {
        p_price: job.price_inr, p_lease: job.lease_id, p_reason: reason, p_retry: retry,
      })) return jsonResponse({ error: "Catalog job lease lost" }, 503);
    } catch {
      return jsonResponse({ error: "Catalog failure could not be recorded" }, 503);
    }
    return jsonResponse({ processed: 1, status: retry ? "retry" : "failed" });
  }
});
