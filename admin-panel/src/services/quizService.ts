import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type { QuizTest, QuizTestInput } from "../types/quiz";
import { applyContentFilters, omitBlankIds } from "../utils/filters";
import type { ContentFilters } from "../types/filters";

// IMPORTANT: this must be "quiz_tests" - it's the exact table the mobile
// app's repositories/quizRepository.ts reads from.
const TABLE = "quiz_tests";

export async function getQuizTests(filters: ContentFilters = {}): Promise<QuizTest[]> {
  const { data, error } = await applyContentFilters(
    supabase.from(TABLE).select("*").order("created_at", { ascending: false }),
    filters
  );
  if (error) throw error;
  return (data ?? []).map((row: any) => toCamelCase<QuizTest>(row));
}

// yearTitle / subjectTitle are UI-only display fields - not columns on the
// "quiz_tests" table - so they must be stripped before sending to Supabase.
export async function addQuizTest(data: QuizTestInput) {
  const { yearTitle, subjectTitle, courseTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).insert(toSnakeCase(omitBlankIds(payload)));
  if (error) throw error;
}

export async function updateQuizTest(id: string, data: QuizTestInput) {
  const { yearTitle, subjectTitle, courseTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).update(toSnakeCase(omitBlankIds(payload))).eq("id", id);
  if (error) throw error;
}

export async function deleteQuizTest(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
