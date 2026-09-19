import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type { QuizTest, QuizTestInput } from "../types/quiz";

// IMPORTANT: this must be "quiz_tests" - it's the exact table the mobile
// app's repositories/quizRepository.ts reads from.
const TABLE = "quiz_tests";

export async function getQuizTests(): Promise<QuizTest[]> {
  const { data, error } = await supabase.from(TABLE).select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<QuizTest>(row));
}

// yearTitle / subjectTitle are UI-only display fields - not columns on the
// "quiz_tests" table - so they must be stripped before sending to Supabase.
export async function addQuizTest(data: QuizTestInput) {
  const { yearTitle, subjectTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).insert(toSnakeCase(payload));
  if (error) throw error;
}

export async function updateQuizTest(id: string, data: QuizTestInput) {
  const { yearTitle, subjectTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).update(toSnakeCase(payload)).eq("id", id);
  if (error) throw error;
}

export async function deleteQuizTest(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
