import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import type { AppUser } from "../types/user";
import { applyContentFilters } from "../utils/filters";
import type { ContentFilters } from "../types/filters";

const TABLE = "profiles";

export async function getUsers(filters: ContentFilters = {}): Promise<AppUser[]> {
  const { data, error } = await applyContentFilters(
    supabase
      .from(TABLE)
      .select("*, courses ( name ), years ( title )")
      .order("created_at", { ascending: false }),
    filters
  );
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...toCamelCase<AppUser>(row),
    courseTitle: row.courses?.name ?? undefined,
    yearTitle: row.years?.title ?? undefined,
  }));
}

export async function setUserBlocked(id: string, blocked: boolean) {
  const { error } = await supabase.from(TABLE).update({ blocked }).eq("id", id);
  if (error) throw error;
}
