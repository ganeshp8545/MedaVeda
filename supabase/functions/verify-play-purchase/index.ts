import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getUserFromAuthHeader, supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { withinLimit } from "../_shared/rateLimit.ts";
import { consumeProductPurchase, getProductPurchase, getProductPurchaseV2, GoogleApiError, sha256Hex } from "../_shared/googlePlay.ts";
import { validatePlayPurchaseV2 } from "../_shared/playPurchaseValidation.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req); if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  const user = await getUserFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "Please log in before purchasing." }, 401);
  const body = await req.json().catch(() => ({})) as { purchaseToken?: unknown; productId?: unknown; internalOrderId?: unknown };
  const token = typeof body.purchaseToken === "string" ? body.purchaseToken : "";
  const productId = typeof body.productId === "string" ? body.productId : "";
  const orderId = typeof body.internalOrderId === "string" ? body.internalOrderId : "";
  if (!UUID.test(orderId) || !productId || productId.length > 100 || token.length < 10 || token.length > 4096)
    return jsonResponse({ error: "Invalid purchase details." }, 400);
  if (!(await withinLimit(`verify-play:${user.id}`, 60, 600))) return jsonResponse({ error: "Too many attempts." }, 429);
  const { data: order, error: orderError } = await supabaseAdmin.from("orders")
    .select("id,user_id,product_id,provider,play_sku,play_purchase_option_id,amount,status,purchase_token,external_transaction_token,external_choice_bound_order_id")
    .eq("id", orderId).maybeSingle();
  if (orderError || !order || order.user_id !== user.id || order.product_id !== productId || order.provider !== "play"
      || !order.play_sku || order.external_transaction_token || order.external_choice_bound_order_id
      || (order.purchase_token && order.purchase_token !== token))
    return jsonResponse({ error: "Purchase order mismatch." }, 403);
  try {
    let paidMillis: number;
    let consumed: boolean;
    if (order.play_purchase_option_id) {
      const purchase = await getProductPurchaseV2(token);
      const checked = validatePlayPurchaseV2(purchase, {
        sku: order.play_sku, optionId: order.play_purchase_option_id,
        accountHash: await sha256Hex(user.id), orderHash: await sha256Hex(orderId), now: Date.now(),
      });
      if (checked.status === "pending")
        return jsonResponse({ success: false, pending: true, internalOrderId: orderId });
      if (checked.status === "invalid")
        return jsonResponse({ error: "Play purchase did not match this order." }, 403);
      paidMillis = checked.paidMillis;
      consumed = checked.consumed;
    } else {
      // Existing orders predate the BUY-option snapshot. Keep their v1 recovery path.
      const purchase = await getProductPurchase(order.play_sku, token);
      if (purchase.purchaseState === 2) return jsonResponse({ success: false, pending: true, internalOrderId: orderId });
      if (purchase.purchaseState !== 0 || purchase.refundableQuantity === 0
          || (purchase.productId && purchase.productId !== order.play_sku)
          || (purchase.purchaseToken && purchase.purchaseToken !== token)
          || purchase.regionCode !== "IN" || (purchase.quantity ?? 1) !== 1
          || purchase.obfuscatedExternalAccountId !== await sha256Hex(user.id)
          || purchase.obfuscatedExternalProfileId !== await sha256Hex(orderId))
        return jsonResponse({ error: "Play purchase did not match this order." }, 403);
      paidMillis = Number(purchase.purchaseTimeMillis);
      consumed = purchase.consumptionState === 1;
    }
    if (!Number.isSafeInteger(paidMillis) || paidMillis <= 0 || paidMillis > Date.now() + 300_000)
      return jsonResponse({ error: "Play purchase time invalid." }, 403);
    if (consumed && order.status !== "paid")
      return jsonResponse({ error: "Play purchase was already consumed." }, 409);
    const { data: settlement, error: settleError } = await supabaseAdmin.rpc("settle_play_purchase", {
      p_user_id: user.id, p_order_id: orderId, p_product_id: productId,
      p_play_sku: order.play_sku, p_purchase_token: token, p_paid_at: new Date(paidMillis).toISOString(),
    });
    if (settleError || !settlement?.ok) {
      console.error("verify-play-purchase settlement failed", settleError?.code);
      return jsonResponse({ error: "Purchase confirmation pending. Please retry." }, 503);
    }
    if (consumed) {
      await supabaseAdmin.from("orders").update({ play_consumption_status: "consumed" }).eq("id", orderId).eq("purchase_token", token);
    } else {
      try {
        await consumeProductPurchase(order.play_sku, token);
        await supabaseAdmin.from("orders").update({ play_consumption_status: "consumed" }).eq("id", orderId).eq("purchase_token", token);
      } catch (error) {
        console.error("verify-play-purchase consumption pending", error instanceof GoogleApiError ? error.message : "Consumption request failed");
        // A concurrent verification/worker may already have recorded success.
        await supabaseAdmin.from("orders").update({ play_consumption_status: "failed" })
          .eq("id", orderId).eq("purchase_token", token).neq("play_consumption_status", "consumed");
      }
    }
    const { data: product } = await supabaseAdmin.from("products").select("title").eq("id", productId).maybeSingle();
    if (settlement.duplicate) return jsonResponse({ error: "This product was already owned; contact support for a refund." }, 409);
    return jsonResponse({ success: true, internalOrderId: orderId, amount: Number(settlement.amount),
      productTitle: product?.title ?? "Your content" });
  } catch (error) {
    console.error("verify-play-purchase API unavailable", error instanceof GoogleApiError ? {
      operation: error.operation, status: error.status, reason: error.reason,
      requestId: error.requestId, details: error.details,
    } : "Purchase verification failed");
    if (error instanceof GoogleApiError && [400, 404, 410].includes(error.status))
      return jsonResponse({ error: "Google Play could not validate this purchase." }, 403);
    return jsonResponse({ error: "Play verification unavailable. Please retry." }, 503);
  }
});
