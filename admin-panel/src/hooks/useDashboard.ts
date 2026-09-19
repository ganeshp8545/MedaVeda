import { useEffect, useState } from "react";

import { getDashboardStats } from "../services/dashboardService";

export default function useDashboard() {
  const [stats, setStats] = useState({
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
  }, []);

  async function load() {
    try {
      setLoading(true);
      const data = await getDashboardStats();
      setStats(data);
    } finally {
      setLoading(false);
    }
  }

  return { stats, loading, reload: load };
}