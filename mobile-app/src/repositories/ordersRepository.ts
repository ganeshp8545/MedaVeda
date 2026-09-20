import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import { Order } from "../types/order";

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
