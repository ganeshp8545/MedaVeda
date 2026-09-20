import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import { Order, OrderStatus } from "../types/order";

export async function createOrder(
  data: Omit<Order, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const { data: row, error } = await supabase
    .from("orders")
    .insert(toSnakeCase(data))
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  const { data, error } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toCamelCase<Order>(data);
}

export async function getOrdersByUser(uid: string): Promise<Order[]> {
  const { data, error } = await supabase.from("orders").select("*").eq("user_id", uid);
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<Order>(row));
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  extra?: Partial<Pick<Order, "razorpayOrderId" | "razorpayPaymentId">>
): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .update({ status, ...toSnakeCase(extra ?? {}), updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) throw error;
}
