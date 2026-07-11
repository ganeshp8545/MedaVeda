import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { auth, db } from "../config/firebase";

export default function useQuizStats() {
  const [loading, setLoading] = useState(true);

  const [totalAttempts, setTotalAttempts] = useState(0);

  const [averagePercentage, setAveragePercentage] = useState(0);

  const [bestScore, setBestScore] = useState(0);

  const [recentQuiz, setRecentQuiz] = useState<any[]>([]);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setError(null);

      const uid = auth.currentUser?.uid;

      if (!uid) {
        setLoading(false);
        return;
      }

      // Bug fix: this previously included `orderBy("createdAt", "desc")`
      // alongside `where("userId", "==", uid)`. A where()-on-one-field +
      // orderBy()-on-a-different-field query always needs a Firestore
      // composite index - without one deployed, getDocs() throws
      // "failed-precondition", which the catch block below silently
      // swallowed (just console.log), leaving Student Progress stuck at
      // 0/blank with no visible error. Sorting client-side instead avoids
      // ever needing that index, matching the same pattern already used
      // in yearsService/subjectsService/chaptersService.
      const q = query(
        collection(db, "quizScores"),
        where("userId", "==", uid)
      );

      const snapshot = await getDocs(q);

      const data = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .sort((a: any, b: any) => {
          const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : a.createdAt ?? 0;
          const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : b.createdAt ?? 0;
          return bTime - aTime;
        });

      setTotalAttempts(data.length);

      if (data.length > 0) {
        const totalPercentage = data.reduce(
          (sum: number, item: any) =>
            sum + item.percentage,
          0
        );

        setAveragePercentage(
          Math.round(totalPercentage / data.length)
        );

        const highest = Math.max(
          ...data.map((item: any) => item.percentage)
        );

        setBestScore(highest);

        setRecentQuiz(data.slice(0, 5));
      }

      setLoading(false);
    } catch (err: any) {
      console.error("useQuizStats: failed to load stats", err);
      setError("Could not load your progress. Pull down to try again.");
      setLoading(false);
    }
  };

  return {
    loading,
    totalAttempts,
    averagePercentage,
    bestScore,
    recentQuiz,
    error,
    refresh: loadStats,
  };
}