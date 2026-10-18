import type { QuizTestQuestion } from "../types/quiz";

export function validateQuizQuestion(question: QuizTestQuestion): string | null {
  if (!question.question.trim()) return "Question text is required";

  const options = question.options.map((option) => option.trim());
  const filled = options.filter(Boolean);
  if (filled.length < 2) return "Fill in at least 2 options";
  if (new Set(filled.map((option) => option.toLowerCase())).size !== filled.length) {
    return "Options must be unique";
  }
  if (!question.answer.trim() || !question.options.includes(question.answer)) {
    return "Select the correct answer";
  }
  return null;
}
