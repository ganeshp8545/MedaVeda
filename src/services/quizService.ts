import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "../config/firebase";

export interface QuizTestQuestion {
  question: string;
  options: string[];
  answer: string;
}

export interface QuizTest {
  id: string;
  title: string;
  chapterId: string;
  chapterTitle: string;
  order: number;
  active: boolean;
  questions: QuizTestQuestion[];
}

const quizTestsCollection = collection(db, "quizTests");

export async function fetchQuizTestsByChapter(
  chapterId: string
): Promise<QuizTest[]> {
  const q = query(
    quizTestsCollection,
    where("chapterId", "==", chapterId),
    where("active", "==", true)
  );

  const snapshot = await getDocs(q);

  const results = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as QuizTest[];

  // Sorted client-side (instead of Firestore orderBy) so this query
  // never needs a manual composite index to be created in the console.
  return results.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
}
