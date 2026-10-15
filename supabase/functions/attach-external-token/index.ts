import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getUserFromAuthHeader, supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { withinLimit } from "../_shared/rateLimit.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req); if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  const user = await getUserFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "Please log in before purchasing." }, 401);
  const body = await req.json().catch(() => ({})) as { internalOrderId?: unknown; externalTransactionToken?: unknown };
  const orderId = typeof body.internalOrderId === "string" ? body.internalOrderId : "";
  const token = typeof body.externalTransactionToken === "string" ? body.externalTransactionToken : "";
  if (!UUID.test(orderId) || token.length < 10 || token.length > 4096) return jsonResponse({ error: "Invalid choice details." }, 400);
  if (!(await withinLimit(`attach-external:${user.id}`, 20, 600))) return jsonResponse({ error: "Too many attempts." }, 429);
  const { data, error } = await supabaseAdmin.rpc("attach_ucb_external_token", {
    p_user_id: user.id, p_order_id: orderId, p_token: token,
  });
  if (error) { console.error("attach-external-token failed", error.code); return jsonResponse({ error: "Unable to save billing choice." }, 500); }
  if (!data?.ok) return jsonResponse({ error: data?.code ?? "choice_unavailable" }, 409);
  return jsonResponse({ ok: true });
});
