import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type { Year, YearInput } from "../types/year";

const TABLE = "years";

export async function getYears(): Promise<Year[]> {
  const { data, error } = await supabase.from(TABLE).select("*").order("order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<Year>(row));
}

export async function addYear(data: YearInput) {
  const { error } = await supabase.from(TABLE).insert(toSnakeCase(data));
  if (error) throw error;
}

export async function updateYear(id: string, data: YearInput) {
  const { error } = await supabase.from(TABLE).update(toSnakeCase(data)).eq("id", id);
  if (error) throw error;
}

export async function deleteYear(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
