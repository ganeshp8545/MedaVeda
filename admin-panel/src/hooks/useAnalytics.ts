import { useEffect, useState } from "react";

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

export default function useAnalytics() {
  const [data, setData] = useState<AnalyticsData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const result = await getAnalytics();
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
