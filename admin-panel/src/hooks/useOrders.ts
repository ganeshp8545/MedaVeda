import { useCallback, useEffect, useState } from "react";
import type { ContentFilters } from "../types/filters";

import { getOrders, updateOrderStatus } from "../services/orderService";

import type { Order, OrderStatus } from "../types/order";

export default function useOrders(filters: ContentFilters = {}) {
  const { courseId, yearId } = filters;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getOrders({ courseId, yearId });
      setOrders(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load orders. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [courseId, yearId]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  async function changeStatus(id: string, status: OrderStatus) {
    await updateOrderStatus(id, status);
    await loadOrders();
  }

  return {
    orders,
    loading,
    error,
    reload: loadOrders,
    changeStatus,
  };
}
