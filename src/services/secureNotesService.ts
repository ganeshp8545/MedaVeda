import { supabase } from "../config/supabase";

// ============================================================================
// Part of the "notes bucket must not be public" fix (see audit report).
//
// Today `note.pdfUrl` (from the `notes` table) is a getPublicUrl()-style
// string like:
//   https://<project-ref>.supabase.co/storage/v1/object/public/notes/<path>
// That works today only because the bucket is still public. Once you flip
// the bucket to Private in the Dashboard, that exact URL stops resolving -
// so every screen that currently does `<PdfViewer pdfUrl={note.pdfUrl}>`
// or downloads it directly needs to go through getSecureNoteUrl() first.
//
// We deliberately did NOT change what's stored in the `notes` table or
// what admin's uploadFile() returns - getPublicUrl() still works fine as
// a way to *encode the storage path* even after the bucket goes private
// (it's a pure string-builder, it doesn't check the bucket's public flag
// or make a network call). We just stop treating that string as directly
// fetchable, and instead extract the path from it and ask Storage for a
// short-lived signed URL - which Storage will only hand out if the
// `notes_read_if_purchased` policy (see recommended-rls-policies.sql,
// storage section) allows it for the current user. That's what actually
// enforces the paywall now - not the app hiding the button.
// ============================================================================

const NOTES_BUCKET = "notes";
const SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 minutes - plenty for one PDF view/download

/**
 * Pulls the storage object path out of a stored public-style note URL.
 * Works regardless of whether the bucket is currently public or private,
 * since it's just string parsing.
 */
function extractStoragePath(pdfUrl: string): string {
  const marker = `/object/public/${NOTES_BUCKET}/`;
  const idx = pdfUrl.indexOf(marker);
  if (idx === -1) {
    // Already a bare path (e.g. if you migrate admin to store paths
    // directly later), or an unexpected URL shape - fail loudly rather
    // than silently requesting garbage.
    throw new Error("Could not determine the storage path for this note.");
  }
  return decodeURIComponent(pdfUrl.slice(idx + marker.length));
}

/**
 * Resolves a Note's stored URL into a fresh, short-lived signed URL that
 * Storage will only issue if the current user is allowed to read that
 * file (per the storage.objects RLS policy). Call this right before
 * opening the PDF viewer or starting a download - never cache the
 * result, it expires.
 *
 * Throws if the user isn't entitled (no matching purchase) or isn't
 * logged in - callers should catch this and show a locked/purchase
 * message, not a generic network error.
 */
export async function getSecureNoteUrl(pdfUrl: string): Promise<string> {
  const path = extractStoragePath(pdfUrl);

  const { data, error } = await supabase.storage
    .from(NOTES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(
      "This note isn't available to you right now. If you believe this is a mistake, please contact support."
    );
  }

  return data.signedUrl;
}
