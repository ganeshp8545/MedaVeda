import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type { Subject, SubjectInput } from "../types/subject";
import { applyContentFilters, fetchAllPages, omitBlankIds } from "../utils/filters";
import type { ContentFilters } from "../types/filters";

const TABLE = "subjects";

export async function getSubjects(filters: ContentFilters = {}): Promise<Subject[]> {
  const rows = await fetchAllPages<any>(() => applyContentFilters(
    supabase.from(TABLE).select("*").order("order", { ascending: true }).order("id"),
    filters
  ));
  return rows.map((row) => toCamelCase<Subject>(row));
}

export async function getSubjectsByYear(yearId: string): Promise<Subject[]> {
  const rows = await fetchAllPages<any>(() => supabase.from(TABLE).select("*")
    .eq("year_id", yearId).order("order", { ascending: true }).order("id"));
  return rows.map((row) => toCamelCase<Subject>(row));
}

// yearTitle is a UI-only display field (kept in the type for the rest of the
// app's convenience) - it is NOT a column on the "subjects" table, so it must
// be stripped before we send the payload to Supabase.
export async function addSubject(data: SubjectInput) {
  const { yearTitle, courseTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).insert(toSnakeCase(omitBlankIds(payload)));
  if (error) throw error;
}

export async function updateSubject(id: string, data: SubjectInput) {
  const { yearTitle, courseTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).update(toSnakeCase(omitBlankIds(payload))).eq("id", id).select("id").single();
  if (error) throw error;
}

export async function deleteSubject(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id).select("id").single();
  if (error) throw error;
}
