import { supabase } from "../config/supabase";

// The `notes` storage bucket is PRIVATE. The only way to read a PDF is the
// get-note-url Edge Function, which checks the caller's entitlement (free
// preview flag, or a purchase covering the chapter) and returns a signed URL
// that expires after ~2 minutes. Never cache the result and never build a
// storage URL from note.pdfUrl on the client - that URL no longer resolves.

export class NoteAccessError extends Error {
  constructor(public readonly status?: number) {
    super("This note is unavailable. Check your connection and access, then retry.");
  }
}

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
    signal: AbortSignal.timeout(10_000),
  });

  if (error || !data?.url) {
    throw new NoteAccessError(error?.context?.status);
  }

  return data.url as string;
}
