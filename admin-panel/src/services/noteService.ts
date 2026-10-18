import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type { Note, NoteInput } from "../types/note";
import { applyContentFilters, fetchAllPages, omitBlankIds } from "../utils/filters";
import type { ContentFilters } from "../types/filters";

const TABLE = "notes";

export async function getNotes(filters: ContentFilters = {}): Promise<Note[]> {
  const rows = await fetchAllPages<any>(() => applyContentFilters(
    supabase.from(TABLE).select("*").order("created_at", { ascending: false }).order("id"), filters
  ));
  return rows.map((row) => toCamelCase<Note>(row));
}

// chapterTitle is a UI-only display field - not a column on the "notes"
// table - so it must be stripped before sending to Supabase.
export async function addNote(data: NoteInput) {
  const { chapterTitle, courseTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).insert(toSnakeCase(omitBlankIds(payload))).select("id").single();
  if (error) throw error;
}

// The RPC attaches an already validated PDF and saves the note atomically.
// Reusing a request ID returns the same note if the response was lost.
export async function saveNoteWithUpload(data: NoteInput, requestId: string, noteId?: string): Promise<string> {
  const { data: savedId, error } = await supabase.rpc("save_note_with_upload", {
    p_request_id: requestId,
    p_note_id: noteId ?? null,
    p_title: data.title,
    p_description: data.description,
    p_chapter_id: data.chapterId,
    p_order: data.order,
    p_active: data.active,
    p_is_free_preview: data.isFreePreview ?? false,
  });
  if (error) throw error;
  if (typeof savedId !== "string") throw new Error("Note save returned no ID.");
  return savedId;
}

export async function updateNote(id: string, data: NoteInput) {
  const { chapterTitle, courseTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).update(toSnakeCase(omitBlankIds(payload))).eq("id", id).select("id").single();
  if (error) throw error;
}

export async function deleteNote(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id).select("id").single();
  if (error) throw error;
}
