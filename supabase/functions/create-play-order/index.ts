import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getUserFromAuthHeader, supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { withinLimit } from "../_shared/rateLimit.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req); if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  const user = await getUserFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "Please log in before purchasing." }, 401);
  const body = await req.json().catch(() => ({})) as { productId?: unknown };
  const productId = typeof body.productId === "string" ? body.productId : "";
  if (!productId || productId.length > 100) return jsonResponse({ error: "Invalid productId." }, 400);
  if (!(await withinLimit(`create-play-order:${user.id}`, 10, 600))) return jsonResponse({ error: "Too many attempts." }, 429);
  const { data, error } = await supabaseAdmin.rpc("create_play_order", { p_user_id: user.id, p_product_id: productId });
  if (error) { console.error("create-play-order failed", error.code); return jsonResponse({ error: "Unable to create Play order." }, 500); }
  if (!data?.ok) return jsonResponse({ error: data?.code ?? "order_unavailable", code: data?.code }, 400);
  return jsonResponse({ internalOrderId: data.order_id, playSku: data.play_sku });
});
