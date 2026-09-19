import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type { Note, NoteInput } from "../types/note";

const TABLE = "notes";

export async function getNotes(): Promise<Note[]> {
  const { data, error } = await supabase.from(TABLE).select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<Note>(row));
}

// chapterTitle is a UI-only display field - not a column on the "notes"
// table - so it must be stripped before sending to Supabase.
export async function addNote(data: NoteInput) {
  const { chapterTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).insert(toSnakeCase(payload));
  if (error) throw error;
}

export async function updateNote(id: string, data: NoteInput) {
  const { chapterTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).update(toSnakeCase(payload)).eq("id", id);
  if (error) throw error;
}

export async function deleteNote(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
