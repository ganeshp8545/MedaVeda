// Firestore collection: "quizTests"
//
// Product-based split: MCQ Quiz is always free, so it no longer needs a
// chapterId - tests are organized (and fetched) at the Subject level only.
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
}
