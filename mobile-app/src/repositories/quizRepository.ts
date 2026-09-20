import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import { QuizTest } from "../types/quiz";

export async function getQuizTestsBySubject(subjectId: string): Promise<QuizTest[]> {
  const { data, error } = await supabase
    .from("quiz_tests")
    // "quiz_tests" only stores subject_id/year_id - subjectTitle/yearTitle
    // are UI-only fields the admin panel never writes to the DB, so they
    // must be joined live here (otherwise they show blank wherever a Quiz
    // is listed outside its own Subject screen).
    .select("*, subjects ( title ), years ( title )")
    .eq("subject_id", subjectId)
    .eq("active", true);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...toCamelCase<QuizTest>(row),
    subjectTitle: row.subjects?.title ?? "",
    yearTitle: row.years?.title ?? "",
  }));
}

// Global Search System - every active quiz test across every subject,
// for the search index. Deliberately excludes `questions` (can be a
// sizeable JSON blob per test) since the index only needs id/title/order
// plus enough context to navigate - getQuizTestById below fetches the
// full row (questions included) only once a specific result is tapped.
export async function getAllActiveQuizTestsLite(
  courseId?: string
): Promise<Omit<QuizTest, "questions">[]> {
  let query = supabase
    .from("quiz_tests")
    .select(
      "id, title, subject_id, year_id, course_id, order, active, subjects ( title ), years ( title )"
    )
    .eq("active", true);
  if (courseId) query = query.eq("course_id", courseId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...toCamelCase<Omit<QuizTest, "questions">>(row),
    subjectTitle: row.subjects?.title ?? "",
    yearTitle: row.years?.title ?? "",
  }));
}

export async function getQuizTestById(id: string): Promise<QuizTest | null> {
  const { data, error } = await supabase
    .from("quiz_tests")
    .select("*, subjects ( title ), years ( title )")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...toCamelCase<QuizTest>(data),
    subjectTitle: (data as any).subjects?.title ?? "",
    yearTitle: (data as any).years?.title ?? "",
  };
}
