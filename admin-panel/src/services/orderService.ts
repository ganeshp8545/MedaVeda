import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import type { Order, OrderStatus } from "../types/order";

const TABLE = "orders";

// Orders join user + product info for display (the Firestore version
// denormalized these fields onto the order itself; Postgres joins them
// live instead, so the data is never stale).
export async function getOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      `*, profiles ( name, email ), products ( title )`
    )
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...toCamelCase<Order>(row),
    userName: row.profiles?.name ?? "",
    userEmail: row.profiles?.email ?? "",
    productTitle: row.products?.title ?? "",
    paymentId: row.razorpay_payment_id ?? undefined,
  }));
}

export async function updateOrderStatus(id: string, status: OrderStatus) {
  const { error } = await supabase.from(TABLE).update({ status }).eq("id", id);
  if (error) throw error;
}
