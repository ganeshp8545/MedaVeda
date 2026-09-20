import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import { Subject } from "../types/subject";

export async function getSubjectsByYear(yearId: string): Promise<Subject[]> {
  const { data, error } = await supabase
    .from("subjects")
    // "subjects" only stores year_id - yearTitle is a UI-only field the
    // admin panel never writes to the DB, so it must be joined live here
    // (otherwise every Subject card's year name shows blank).
    .select("*, years ( title )")
    .eq("year_id", yearId)
    .eq("active", true);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...toCamelCase<Subject>(row),
    yearTitle: row.years?.title ?? "",
  }));
}

// Global Search System - every active subject across every year, for the
// search index. Same join as getSubjectsByYear, just without the
// year_id filter.
export async function getAllActiveSubjects(courseId?: string): Promise<Subject[]> {
  let query = supabase.from("subjects").select("*, years ( title )").eq("active", true);
  if (courseId) query = query.eq("course_id", courseId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...toCamelCase<Subject>(row),
    yearTitle: row.years?.title ?? "",
  }));
}
