import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type { Chapter, ChapterInput } from "../types/chapter";

const TABLE = "chapters";

export async function getChapters(): Promise<Chapter[]> {
  const { data, error } = await supabase.from(TABLE).select("*").order("order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<Chapter>(row));
}

export async function getChaptersBySubject(subjectId: string): Promise<Chapter[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("subject_id", subjectId)
    .order("order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<Chapter>(row));
}

// yearTitle / subjectTitle are UI-only display fields - not columns on the
// "chapters" table - so they must be stripped before sending to Supabase.
export async function addChapter(data: ChapterInput) {
  const { yearTitle, subjectTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).insert(toSnakeCase(payload));
  if (error) throw error;
}

export async function updateChapter(id: string, data: ChapterInput) {
  const { yearTitle, subjectTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).update(toSnakeCase(payload)).eq("id", id);
  if (error) throw error;
}

export async function deleteChapter(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
