import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type { Subject, SubjectInput } from "../types/subject";

const TABLE = "subjects";

export async function getSubjects(): Promise<Subject[]> {
  const { data, error } = await supabase.from(TABLE).select("*").order("order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<Subject>(row));
}

export async function getSubjectsByYear(yearId: string): Promise<Subject[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("year_id", yearId)
    .order("order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<Subject>(row));
}

// yearTitle is a UI-only display field (kept in the type for the rest of the
// app's convenience) - it is NOT a column on the "subjects" table, so it must
// be stripped before we send the payload to Supabase.
export async function addSubject(data: SubjectInput) {
  const { yearTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).insert(toSnakeCase(payload));
  if (error) throw error;
}

export async function updateSubject(id: string, data: SubjectInput) {
  const { yearTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).update(toSnakeCase(payload)).eq("id", id);
  if (error) throw error;
}

export async function deleteSubject(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
