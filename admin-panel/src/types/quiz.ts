// Firestore collection: "quizTests" (matches the mobile app's
// repositories/quizRepository.ts + types/quiz.ts exactly).
//
// MedVeda 2.0: MCQ Quiz is always free, so a Test is scoped to a
// Subject (not a Chapter) and holds all of its questions inline in a
// single document - there is no separate per-question collection.
export interface QuizTestQuestion {
  question: string;
  options: string[];
  answer: string;
}

export interface QuizTest {
  id: string;
  title: string;

  subjectId: string;
  subjectTitle: string;
  yearId: string;
  yearTitle: string;

  order: number;
  active: boolean;
  questions: QuizTestQuestion[];
  createdAt?: any;
}

export type QuizTestInput = Omit<QuizTest, "id" | "createdAt">;
