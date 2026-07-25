import { useEffect, useState } from "react";

import { supabase } from "../config/supabase";
import { getCurrentUser } from "../services/authState";

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

      const uid = getCurrentUser()?.id;

      if (!uid) {
        setLoading(false);
        return;
      }

      const { data, error: queryError } = await supabase
        .from("quiz_scores")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      const rows = data ?? [];

      setTotalAttempts(rows.length);

      if (rows.length > 0) {
        const totalPercentage = rows.reduce(
          (sum: number, item: any) => sum + item.percentage,
          0
        );

        setAveragePercentage(
          Math.round(totalPercentage / rows.length)
        );

        const highest = Math.max(
          ...rows.map((item: any) => item.percentage)
        );

        setBestScore(highest);

        setRecentQuiz(rows.slice(0, 5));
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
