import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import { Note } from "../types/note";

export async function getNotesByChapter(chapterId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("chapter_id", chapterId)
    .eq("active", true);
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<Note>(row));
}

// Global Search System - every active note across every chapter, for the
// search index. "notes" only stores chapter_id (no subject/year context
// on the row itself) - searchService joins each note to its chapter from
// the already-fetched chapters index rather than nesting a second embed
// here, so this stays a plain single-table read.
export async function getAllActiveNotes(): Promise<Note[]> {
  const { data, error } = await supabase.from("notes").select("*").eq("active", true);
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<Note>(row));
}
