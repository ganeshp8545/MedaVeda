// POST /functions/v1/send-push-notification      (admin only)
// Header: Authorization: Bearer <admin's access token>
//
// verify_jwt is OFF in config.toml on purpose: the admin panel calls this from a
// browser, and a gateway-level 401 carries no CORS headers (the browser would
// report it as a CORS failure). Authentication is done here instead: the caller's
// JWT is verified with Supabase Auth and the resulting user id must be in
// public.admins (same rule as public.am_i_admin()).
//
// Body: { title, body, type?, targetUserIds?: uuid[], data?: { screen?: string, params?: object } }
//   1. inserts a row into `notifications` (in-app notification centre), then
//   2. sends the push through Expo to the matching device tokens.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { aalFromAuthHeader, getUserFromAuthHeader, supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { withinLimit } from "../_shared/rateLimit.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/;
const TYPES = new Set(["announcement", "new_notes", "new_video", "quiz", "offer", "app_update", "exam_reminder", "payment_success"]);
const MAX_TITLE = 100;
const MAX_BODY = 500;
const MAX_TARGETS = 1000;
const MAX_DATA_BYTES = 1024;
const PAGE = 1000;

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) return jsonResponse({ error: "Invalid or expired session" }, 401);

    const { data: adminRow, error: adminErr } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (adminErr) {
      console.error("send-push-notification: admin lookup failed", adminErr.code);
      return jsonResponse({ error: "Something went wrong." }, 500);
    }
    if (!adminRow) return jsonResponse({ error: "Admin access required" }, 403);

    // Same rule as am_i_admin(): once the owner switches admin MFA on, a password-only (aal1) session is not enough.
    const { data: mfa, error: mfaErr } = await supabaseAdmin.from("admin_settings").select("require_mfa").eq("id", true).maybeSingle();
    if (mfaErr) return jsonResponse({ error: "Something went wrong." }, 500);   // fail closed
    if (mfa?.require_mfa && aalFromAuthHeader(req) !== "aal2") {
      return jsonResponse({ error: "Multi-factor authentication required" }, 403);
    }

    if (!(await withinLimit(`push-send:${user.id}`, 10, 3600))) {
      return jsonResponse({ error: "Too many notifications sent recently. Try again later." }, 429);
    }

    const input = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!input || typeof input !== "object") return jsonResponse({ error: "Invalid request body" }, 400);

    const title = typeof input.title === "string" ? input.title.trim() : "";
    const body = typeof input.body === "string" ? input.body.trim() : "";
    if (!title || title.length > MAX_TITLE) return jsonResponse({ error: `title is required (max ${MAX_TITLE} characters)` }, 400);
    if (!body || body.length > MAX_BODY) return jsonResponse({ error: `body is required (max ${MAX_BODY} characters)` }, 400);

    const type = input.type === undefined || input.type === null ? "app_update" : input.type;
    if (typeof type !== "string" || !TYPES.has(type)) return jsonResponse({ error: "Unknown notification type" }, 400);

    let targets: string[] | null = null;
    if (input.targetUserIds !== undefined && input.targetUserIds !== null) {
      const ids = input.targetUserIds;
      if (!Array.isArray(ids) || ids.length > MAX_TARGETS || !ids.every((v) => typeof v === "string" && UUID.test(v))) {
        return jsonResponse({ error: `targetUserIds must be up to ${MAX_TARGETS} user ids` }, 400);
      }
      targets = ids.length > 0 ? (ids as string[]) : null;
    }

    let data: Record<string, unknown> = {};
    if (input.data !== undefined && input.data !== null) {
      if (typeof input.data !== "object" || Array.isArray(input.data)) return jsonResponse({ error: "data must be an object" }, 400);
      const raw = input.data as Record<string, unknown>;
      if (raw.screen !== undefined && (typeof raw.screen !== "string" || raw.screen.length > 64)) {
        return jsonResponse({ error: "data.screen must be a short string" }, 400);
      }
      if (new TextEncoder().encode(JSON.stringify(raw)).length > MAX_DATA_BYTES) {
        return jsonResponse({ error: "data is too large" }, 400);
      }
      data = raw;
    }

    // In-app notification centre (shown even where push is not granted).
    const { error: insertError } = await supabaseAdmin
      .from("notifications")
      .insert({ title, body, type, active: true });
    if (insertError) console.error("send-push-notification: notification row insert failed", insertError.code);

    // Collect device tokens page by page (PostgREST returns at most 1000 rows per request).
    const tokens: string[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = supabaseAdmin.from("push_tokens").select("expo_push_token").order("expo_push_token").range(from, from + PAGE - 1);
      if (targets) query = query.in("user_id", targets);
      const { data: rows, error } = await query;
      if (error) {
        console.error("send-push-notification: token query failed", error.code);
        return jsonResponse({ error: "Something went wrong." }, 500);
      }
      for (const r of rows ?? []) {
        if (typeof r.expo_push_token === "string" && EXPO_TOKEN.test(r.expo_push_token)) tokens.push(r.expo_push_token);
      }
      if (!rows || rows.length < PAGE) break;
    }

    if (tokens.length === 0) return jsonResponse({ success: true, pushed: 0, note: "No registered devices matched." });

    // Expo accepts up to 100 messages per request.
    let sent = 0;
    for (let i = 0; i < tokens.length; i += 100) {
      const chunk = tokens.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH_URL, {
        signal: AbortSignal.timeout(15_000),
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(chunk.map((to) => ({ to, title, body, data, sound: "default" }))),
      });
      if (res.ok) sent += chunk.length;
      else console.error("send-push-notification: Expo rejected a chunk", res.status);
    }

    return jsonResponse({ success: true, pushed: sent });
  } catch (err) {
    console.error("send-push-notification: unhandled error", String(err));
    return jsonResponse({ error: "Something went wrong." }, 500);
  }
});
