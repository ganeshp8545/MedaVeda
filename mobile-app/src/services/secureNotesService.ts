import { supabase } from "../config/supabase";

// The `notes` storage bucket is PRIVATE. The only way to read a PDF is the
// get-note-url Edge Function, which checks the caller's entitlement (free
// preview flag, or a purchase covering the chapter) and returns a signed URL
// that expires after ~2 minutes. Never cache the result and never build a
// storage URL from note.pdfUrl on the client - that URL no longer resolves.

/**
 * Resolves a note into a fresh, short-lived signed URL. Call it right before
 * opening the viewer or starting a download.
 *
 * Throws when the user is not signed in, not entitled, or the file is missing -
 * callers show a locked / unavailable message.
 */
export async function getSecureNoteUrl(noteId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("get-note-url", {
    body: { noteId },
  });

  if (error || !data?.url) {
    throw new Error(
      "This note isn't available to you right now. If you believe this is a mistake, please contact support."
    );
  }

  return data.url as string;
}
