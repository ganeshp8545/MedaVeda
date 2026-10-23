import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import { QuizTest } from "../types/quiz";

export async function getQuizTestsBySubject(subjectId: string): Promise<QuizTest[]> {
  const { data, error } = await supabase.rpc("get_public_quiz_tests", {
    p_subject_id: subjectId,
    p_test_id: null,
  });
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
// playable questions (without answer keys) only when a result is tapped.
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
  const { data, error } = await supabase.rpc("get_public_quiz_tests", {
    p_subject_id: null,
    p_test_id: id,
  });
  if (error) throw error;
  const row: any = (data ?? [])[0];
  if (!row) return null;
  return {
    ...toCamelCase<QuizTest>(row),
    subjectTitle: row.subjects?.title ?? "",
    yearTitle: row.years?.title ?? "",
  };
}
