import { useCallback, useEffect, useState } from "react";
import type { ContentFilters } from "../types/filters";

import { getDashboardStats } from "../services/dashboardService";

export default function useDashboard(filters: ContentFilters = {}) {
  const { courseId, yearId } = filters;
  const [stats, setStats] = useState({
    courses: 0,
    years: 0,
    subjects: 0,
    products: 0,
    users: 0,
    notes: 0,
    videos: 0,
    quiz: 0,
  });

  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getDashboardStats({ courseId, yearId });
      setStats(data);
    } finally {
      setLoading(false);
    }
  }, [courseId, yearId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { stats, loading, reload: load };
}