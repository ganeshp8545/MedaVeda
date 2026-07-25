import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import { Year } from "../types/year";

export async function getActiveYears(): Promise<Year[]> {
  const { data, error } = await supabase.from("years").select("*").eq("active", true);
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<Year>(row));
}
