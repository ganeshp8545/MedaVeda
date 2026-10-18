import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type { Chapter, ChapterInput } from "../types/chapter";
import { applyContentFilters, fetchAllPages, omitBlankIds } from "../utils/filters";
import type { ContentFilters } from "../types/filters";

const TABLE = "chapters";

export async function getChapters(filters: ContentFilters = {}): Promise<Chapter[]> {
  const rows = await fetchAllPages<any>(() => applyContentFilters(
    supabase.from(TABLE).select("*").order("order", { ascending: true }).order("id"),
    filters
  ));
  return rows.map((row) => toCamelCase<Chapter>(row));
}

export async function getChaptersBySubject(subjectId: string): Promise<Chapter[]> {
  const rows = await fetchAllPages<any>(() => supabase.from(TABLE).select("*")
    .eq("subject_id", subjectId).order("order", { ascending: true }).order("id"));
  return rows.map((row) => toCamelCase<Chapter>(row));
}

// yearTitle / subjectTitle are UI-only display fields - not columns on the
// "chapters" table - so they must be stripped before sending to Supabase.
export async function addChapter(data: ChapterInput) {
  const { yearTitle, subjectTitle, courseTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).insert(toSnakeCase(omitBlankIds(payload)));
  if (error) throw error;
}

export async function updateChapter(id: string, data: ChapterInput) {
  const { yearTitle, subjectTitle, courseTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).update(toSnakeCase(omitBlankIds(payload))).eq("id", id).select("id").single();
  if (error) throw error;
}

export async function deleteChapter(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id).select("id").single();
  if (error) throw error;
}
