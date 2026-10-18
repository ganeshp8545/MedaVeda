import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import type { AppUser } from "../types/user";
import { applyContentFilters, fetchAllPages } from "../utils/filters";
import type { ContentFilters } from "../types/filters";

const TABLE = "profiles";

export async function getUsers(filters: ContentFilters = {}): Promise<AppUser[]> {
  const rows = await fetchAllPages<any>(() => applyContentFilters(
    supabase
      .from(TABLE)
      .select("*, courses ( name ), years ( title )")
      .order("created_at", { ascending: false }).order("id"),
    filters
  ));
  return rows.map((row: any) => ({
    ...toCamelCase<AppUser>(row),
    courseTitle: row.courses?.name ?? undefined,
    yearTitle: row.years?.title ?? undefined,
  }));
}

export async function setUserBlocked(id: string, blocked: boolean) {
  const { error } = await supabase.from(TABLE).update({ blocked }).eq("id", id).select("id").single();
  if (error) throw error;
}
