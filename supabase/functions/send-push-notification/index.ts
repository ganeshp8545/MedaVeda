// NOTIFICATIONS SYSTEM - send-push-notification Edge Function.
//
// Deploy: supabase functions deploy send-push-notification
//
// Call this from the admin panel (once it has a broadcast composer UI)
// or manually via curl/Postman for now. It does two things:
//   1. Sends the push via Expo's push API to every matching device token.
//   2. Inserts a row into the existing `notifications` table, so the
//      message also shows up in the in-app Notification Center (and
//      counts toward the unread badge) for users who don't have push
//      permission granted or are on a device without a token yet.
//
// Request body:
//   {
//     "title": "New Notes Available",
//     "body": "Anatomy Chapter 5 notes are now live.",
//     "type": "new_notes",              // matches NotificationType in notificationsService.ts
//     "targetUserIds": ["uuid1", ...],  // omit for a full broadcast
//     "data": { "screen": "ChapterDetails", "params": { "chapterId": "..." } }
//   }
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req: Request) => {
  // BUG FIX: this function had no CORS headers and no OPTIONS handler at
  // all. It's meant to be called from the admin panel's browser (per the
  // header comment above), and a browser blocks the whole request client
  // side without an Access-Control-Allow-Origin response header - it
  // would have failed the instant a broadcast composer UI tried to call
  // it, with nothing more helpful than a generic "Failed to fetch" in
  // the browser console. Switched every response below to the shared
  // jsonResponse() helper so this can't regress the same way again.
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // service role - bypasses RLS, reads all tokens
    );

    // SECURITY FIX (already applied before this pass): admin-only check,
    // same "admins by email" pattern the admin panel's AuthContext.tsx
    // uses (via the am_i_admin() RPC) - here queried directly since this
    // function runs as the service role, not as the calling user, so the
    // RPC's auth.email() context isn't available the way it is in the
    // admin panel's own client.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user?.email) {
      return jsonResponse({ error: "Invalid or expired session" }, 401);
    }

    const { data: adminRow } = await supabase
      .from("admins")
      .select("email")
      .eq("email", userData.user.email)
      .maybeSingle();

    if (!adminRow) {
      return jsonResponse({ error: "Admin access required" }, 403);
    }

    const { title, body, type, targetUserIds, data } = await req.json().catch(() => ({}));

    if (!title || !body) {
      return jsonResponse({ error: "title and body are required" }, 400);
    }

    // 1. Mirror into the notifications table (powers the in-app center
    // regardless of whether push actually reaches the device).
    const { error: insertError } = await supabase.from("notifications").insert({
      title,
      body,
      type: type ?? "app_update",
      active: true,
    });
    if (insertError) console.error("Failed to insert notification row:", insertError);

    // 2. Collect push tokens - either everyone, or a specific set of users.
    let tokenQuery = supabase.from("push_tokens").select("expo_push_token");
    if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      tokenQuery = tokenQuery.in("user_id", targetUserIds);
    }
    const { data: tokenRows, error: tokenError } = await tokenQuery;

if (tokenError) {
  console.error("TOKEN QUERY ERROR:", tokenError);
  throw tokenError;
}

console.log("TOKEN ROWS:", tokenRows);
console.log("TOKEN COUNT:", tokenRows?.length);

const tokens = (tokenRows ?? [])
  .map((r: any) => r.expo_push_token)
  .filter(Boolean);

console.log("EXPO TOKENS:", tokens);

    if (tokens.length === 0) {
      return jsonResponse({ success: true, pushed: 0, note: "No registered devices matched." });
    }

    // Expo's push API accepts up to 100 messages per request - chunk it.
    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += 100) chunks.push(tokens.slice(i, i + 100));

    let sent = 0;
    for (const chunk of chunks) {
      const messages = chunk.map((token) => ({
        to: token,
        title,
        body,
        data: data ?? {},
        sound: "default",
      }));

      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(messages),
      });

      if (res.ok) sent += chunk.length;
      else console.error("Expo push send failed for a chunk:", await res.text());
    }

    return jsonResponse({ success: true, pushed: sent });
  } catch (err) {
    console.error("send-push-notification error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});