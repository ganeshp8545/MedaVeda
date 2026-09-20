import { useEffect, useState } from "react";
import type { ContentFilters } from "../types/filters";

import { getDashboardStats } from "../services/dashboardService";

export default function useDashboard(filters: ContentFilters = {}) {
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

  useEffect(() => {
    load();
  }, [filters.courseId, filters.yearId]);

  async function load() {
    try {
      setLoading(true);
      const data = await getDashboardStats(filters);
      setStats(data);
    } finally {
      setLoading(false);
    }
  }

  return { stats, loading, reload: load };
}