import { useEffect, useState } from "react";
import type { ContentFilters } from "../types/filters";

import { getAnalytics } from "../services/analyticsService";
import type { AnalyticsData } from "../services/analyticsService";

const emptyData: AnalyticsData = {
  totalRevenue: 0,
  totalOrders: 0,
  paidOrders: 0,
  pendingOrders: 0,
  failedOrders: 0,
  refundedOrders: 0,
  totalUsers: 0,
  totalProducts: 0,
  topProducts: [],
};

export default function useAnalytics(filters: ContentFilters = {}) {
  const [data, setData] = useState<AnalyticsData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [filters.courseId, filters.yearId]);

  async function load() {
    try {
      setLoading(true);
      const result = await getAnalytics(filters);
      setData(result);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load analytics. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return { data, loading, error, reload: load };
}
