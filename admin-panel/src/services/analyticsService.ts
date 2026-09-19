import { supabase } from "../config/supabase";

export interface TopProduct {
  productId: string;
  productTitle: string;
  orders: number;
  revenue: number;
}

export interface AnalyticsData {
  totalRevenue: number;
  totalOrders: number;
  paidOrders: number;
  pendingOrders: number;
  failedOrders: number;
  refundedOrders: number;
  totalUsers: number;
  totalProducts: number;
  topProducts: TopProduct[];
}

export async function getAnalytics(): Promise<AnalyticsData> {
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("*, products ( title )");
  if (ordersError) throw ordersError;

  let totalRevenue = 0;
  let paidOrders = 0;
  let pendingOrders = 0;
  let failedOrders = 0;
  let refundedOrders = 0;

  const productMap = new Map<string, TopProduct>();

  (orders ?? []).forEach((order: any) => {
    if (order.status === "paid") {
      totalRevenue += order.amount || 0;
      paidOrders += 1;

      const key = order.product_id || "unknown";
      const existing = productMap.get(key);
      const productTitle = order.products?.title || "Untitled";

      if (existing) {
        existing.orders += 1;
        existing.revenue += order.amount || 0;
      } else {
        productMap.set(key, {
          productId: key,
          productTitle,
          orders: 1,
          revenue: order.amount || 0,
        });
      }
    } else if (order.status === "created") {
      pendingOrders += 1;
    } else if (order.status === "failed") {
      failedOrders += 1;
    } else if (order.status === "refunded") {
      refundedOrders += 1;
    }
  });

  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const { count: usersCount, error: usersError } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });
  if (usersError) throw usersError;

  const { count: productsCount, error: productsError } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true });
  if (productsError) throw productsError;

  return {
    totalRevenue,
    totalOrders: (orders ?? []).length,
    paidOrders,
    pendingOrders,
    failedOrders,
    refundedOrders,
    totalUsers: usersCount ?? 0,
    totalProducts: productsCount ?? 0,
    topProducts,
  };
}
