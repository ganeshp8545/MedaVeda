import { useEffect, useState } from "react";

import { supabase } from "../config/supabase";
import { getCurrentUser } from "../services/authState";
import { logError } from "../utils/logger";

export default function useQuizStats() {
  const [loading, setLoading] = useState(true);

  const [totalAttempts, setTotalAttempts] = useState(0);

  const [averagePercentage, setAveragePercentage] = useState(0);

  const [bestScore, setBestScore] = useState(0);

  const [recentQuiz, setRecentQuiz] = useState<any[]>([]);
  const [legacyAttempts, setLegacyAttempts] = useState(0);

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

      const [{ data, error: queryError }, { count: oldCount, error: oldError }] = await Promise.all([
        supabase
        .from("verified_quiz_attempts")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false }),
        supabase.from("quiz_scores").select("id", { count: "exact", head: true }).eq("user_id", uid),
      ]);

      if (queryError) throw queryError;
      if (oldError) throw oldError;

      setLegacyAttempts(oldCount ?? 0);

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
      } else {
        setAveragePercentage(0);
        setBestScore(0);
        setRecentQuiz([]);
      }

      setLoading(false);
    } catch (err: any) {
      logError("useQuizStats: failed to load stats", err);
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
    legacyAttempts,
    error,
    refresh: loadStats,
  };
}
