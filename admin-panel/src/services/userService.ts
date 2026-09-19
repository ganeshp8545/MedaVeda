import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import type { AppUser } from "../types/user";

const TABLE = "profiles";

export async function getUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase.from(TABLE).select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<AppUser>(row));
}

export async function setUserBlocked(id: string, blocked: boolean) {
  const { error } = await supabase.from(TABLE).update({ blocked }).eq("id", id);
  if (error) throw error;
}
