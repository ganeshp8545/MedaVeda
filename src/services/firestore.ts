import {
  getFirestore,
  collection,
  addDoc,
} from "firebase/firestore";

import { app } from "../config/firebase";

const db = getFirestore(app);

export const saveQuizScore = async (
  email: string,
  subject: string,
  score: number,
  total: number
) => {
  try {
    await addDoc(collection(db, "quizScores"), {
      email,
      subject,
      score,
      total,
      percentage: Math.round((score / total) * 100),
      createdAt: new Date(),
    });

    console.log("Quiz Score Saved");
  } catch (error) {
    console.log(error);
  }
};