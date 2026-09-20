import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import { Course } from "../types/course";

// "courses" is readable by everyone when active (needed for the onboarding
// course picker before a profile has a course) - see the RLS section of
// 20260919120000_multi_course_and_referrals.sql.
export async function getActiveCourses(): Promise<Course[]> {
  const { data, error } = await supabase.from("courses").select("*").eq("active", true);
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<Course>(row));
}
