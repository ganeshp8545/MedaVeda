import { getQuizTestsBySubject, getQuizTestById } from "../repositories/quizRepository";

export type { QuizTest, QuizTestQuestion } from "../types/quiz";

export async function fetchQuizTestsBySubject(subjectId: string) {
  const tests = await getQuizTestsBySubject(subjectId);

  // Sorted client-side (instead of Firestore orderBy) so this query
  // never needs a manual composite index to be created in the console.
  return tests.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// Global Search System - the search index only holds a lightweight
// version of each quiz test (no `questions`, see
// getAllActiveQuizTestsLite). This resolves the full test, including
// questions, once a specific search result is tapped and the app is
// about to navigate into the Quiz screen.
export async function fetchQuizTestById(id: string) {
  return getQuizTestById(id);
}
