// POST /functions/v1/get-note-url      Body: { noteId }
// Header: Authorization: Bearer <user access token>   (verify_jwt = true)
//
// The notes bucket is private. This is the only way to read a PDF: the caller
// must be signed in and not blocked, and the note must be a free preview
// (notes.is_free_preview) or covered by one of their purchases
// (user_can_access_note). Returns a short-lived signed URL (120 s).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { withinLimit } from "../_shared/rateLimit.ts";

const BUCKET = "notes";
const TTL_SECONDS = 120;

// notes.pdf_url is either a stored public-style URL
// (…/storage/v1/object/public/notes/<path>) or a bare object path.
function objectPath(pdfUrl: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const idx = pdfUrl.indexOf(marker);
  let path = idx === -1 ? pdfUrl : pdfUrl.slice(idx + marker.length);
  if (/^https?:\/\//i.test(path)) return null;
  path = decodeURIComponent(path.split("?")[0]);
  return path && !path.includes("..") ? path : null;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) return jsonResponse({ error: "Please log in." }, 401);

    const body = (await req.json().catch(() => ({}))) as { noteId?: unknown };
    const noteId = typeof body.noteId === "string" ? body.noteId : "";
    if (!noteId || noteId.length > 100) return jsonResponse({ error: "Missing noteId." }, 400);

    if (!(await withinLimit(`note-url:${user.id}`, 60, 60))) {
      return jsonResponse({ error: "Too many requests. Please slow down." }, 429);
    }

    const { data: allowed, error: accessErr } = await supabaseAdmin.rpc("user_can_access_note", {
      p_user: user.id,
      p_note_id: noteId,
    });
    if (accessErr) {
      console.error("get-note-url: entitlement check failed", accessErr.code);
      return jsonResponse({ error: "Could not open this note." }, 500);
    }
    if (allowed !== true) return jsonResponse({ error: "This note isn't available to you." }, 403);

    const { data: note } = await supabaseAdmin.from("notes").select("pdf_url").eq("id", noteId).maybeSingle();
    const path = note ? objectPath(note.pdf_url) : null;
    if (!path) return jsonResponse({ error: "This note file is unavailable." }, 404);

    const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS);
    if (error || !data?.signedUrl) {
      console.error("get-note-url: signing failed", error?.message);
      return jsonResponse({ error: "This note file is unavailable." }, 404);
    }
    return jsonResponse({ url: data.signedUrl, expiresIn: TTL_SECONDS });
  } catch (err) {
    console.error("get-note-url: unhandled error", err);
    return jsonResponse({ error: "Could not open this note." }, 500);
  }
});
