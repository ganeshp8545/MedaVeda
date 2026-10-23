import { useCallback, useEffect, useState } from "react";
import type { ContentFilters } from "../types/filters";

import { getAnalytics, type AnalyticsData } from "../services/analyticsService";

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
  const { courseId, yearId } = filters;
  const [data, setData] = useState<AnalyticsData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getAnalytics({ courseId, yearId });
      setData(result);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load analytics. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [courseId, yearId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
