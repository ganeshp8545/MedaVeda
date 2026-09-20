import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import type { Order, OrderStatus } from "../types/order";
import { applyContentFilters } from "../utils/filters";
import type { ContentFilters } from "../types/filters";

const TABLE = "orders";

// Orders join user + product info for display (the Firestore version
// denormalized these fields onto the order itself; Postgres joins them
// live instead, so the data is never stale).
export async function getOrders(filters: ContentFilters = {}): Promise<Order[]> {
  // orders has no year_id of its own that means "this order's year", so
  // only the course filter applies.
  const { data, error } = await applyContentFilters(
    supabase
      .from(TABLE)
      .select(`*, profiles ( name, email ), products ( title ), courses ( name )`)
      .order("created_at", { ascending: false }),
    { courseId: filters.courseId }
  );

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...toCamelCase<Order>(row),
    userName: row.profiles?.name ?? "",
    userEmail: row.profiles?.email ?? "",
    productTitle: row.products?.title ?? "",
    courseTitle: row.courses?.name ?? "",
    paymentId: row.razorpay_payment_id ?? undefined,
  }));
}

export async function updateOrderStatus(id: string, status: OrderStatus) {
  const { error } = await supabase.from(TABLE).update({ status }).eq("id", id);
  if (error) throw error;
}
