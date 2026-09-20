// POST /functions/v1/get-video-url      Body: { videoId }
// Header: Authorization: Bearer <user access token>   (verify_jwt = true)
//
// Same entitlement model as get-note-url: a free-preview video (is_free_preview)
// is available to any signed-in, non-blocked user; every other video needs a
// purchase covering its subject/year/bundle. Returns the video URL only when
// allowed. (See docs/security/SECURITY_FIX_NOTES.md for when the database stops
// exposing videos.youtube_url directly - until then this is the enforced-by-API
// path the app should use.)
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { withinLimit } from "../_shared/rateLimit.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) return jsonResponse({ error: "Please log in." }, 401);

    const body = (await req.json().catch(() => ({}))) as { videoId?: unknown };
    const videoId = typeof body.videoId === "string" ? body.videoId : "";
    if (!videoId || videoId.length > 100) return jsonResponse({ error: "Missing videoId." }, 400);

    if (!(await withinLimit(`video-url:${user.id}`, 60, 60))) {
      return jsonResponse({ error: "Too many requests. Please slow down." }, 429);
    }

    const { data: allowed, error: accessErr } = await supabaseAdmin.rpc("user_can_access_video", {
      p_user: user.id,
      p_video_id: videoId,
    });
    if (accessErr) {
      console.error("get-video-url: entitlement check failed", accessErr.code);
      return jsonResponse({ error: "Could not open this video." }, 500);
    }
    if (allowed !== true) return jsonResponse({ error: "This video isn't available to you." }, 403);

    const { data: video } = await supabaseAdmin.from("videos").select("youtube_url").eq("id", videoId).maybeSingle();
    if (!video?.youtube_url) return jsonResponse({ error: "This video is unavailable." }, 404);
    return jsonResponse({ url: video.youtube_url });
  } catch (err) {
    console.error("get-video-url: unhandled error", err);
    return jsonResponse({ error: "Could not open this video." }, 500);
  }
});
