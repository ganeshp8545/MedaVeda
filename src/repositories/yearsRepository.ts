import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import { Year } from "../types/year";

// courseId is optional so unmigrated callers keep working; RLS still
// limits what a student can see either way.
export async function getActiveYears(courseId?: string): Promise<Year[]> {
  let query = supabase.from("years").select("*").eq("active", true);
  if (courseId) query = query.eq("course_id", courseId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<Year>(row));
}
