import { supabase } from "../config/supabase";

export type BillingStatus = {
  product_id: string;
  billing_status: string;
  play_sku: string | null;
  purchase_option_id: string | null;
  synced_price: number | null;
  currency_code: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  attempts: number | null;
};

export async function getBillingStatuses(): Promise<Record<string, BillingStatus>> {
  const { data, error } = await supabase.from("admin_play_billing_status").select("*");
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as BillingStatus[]).map((row) => [row.product_id, row]));
}

export async function retryBillingPrice(price: number): Promise<void> {
  const { data, error } = await supabase.rpc("retry_play_price_sync", { p_price: price });
  if (error) throw error;
  if (data !== true) throw new Error("This price cannot be retried while another sync is running.");
}
