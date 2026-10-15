import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";

export async function getPurchasesByUser(uid: string) {
  const { data, error } = await supabase.from("purchases").select("*").eq("user_id", uid).eq("status", "success");
  if (error) throw error;

  // Returned camelCase (id + fields) - purchasesService maps these into
  // both OwnedScope[] and MyPurchase[] shapes depending on the caller.
  return (data ?? []).map((row) => toCamelCase<any>(row));
}
