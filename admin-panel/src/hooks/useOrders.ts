import { useEffect, useState } from "react";

import { getOrders, updateOrderStatus } from "../services/orderService";

import type { Order, OrderStatus } from "../types/order";

export default function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    try {
      setLoading(true);
      const data = await getOrders();
      setOrders(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load orders. Please try again.");
    } finally {
      setLoading(false);
    }
  }

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
