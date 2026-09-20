import { useEffect, useState } from "react";
import { recordActivityToday, StreakData } from "../utils/streakTracker";

export default function useStreak() {
  const [streak, setStreak] = useState<StreakData>({
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    recordActivityToday()
      .then((data) => {
        if (isMounted) setStreak(data);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return { ...streak, loading };
}
