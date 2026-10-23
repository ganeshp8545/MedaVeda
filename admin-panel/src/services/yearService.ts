import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type { Year, YearInput } from "../types/year";
import { applyContentFilters, fetchAllPages } from "../utils/filters";
import type { ContentFilters } from "../types/filters";

const TABLE = "years";

export async function getYears(filters: ContentFilters = {}): Promise<Year[]> {
  // years has no year_id of its own - only the course filter applies.
  const rows = await fetchAllPages<any>(() => applyContentFilters(
    supabase.from(TABLE).select("*, courses ( name )").order("order", { ascending: true }).order("id"),
    { courseId: filters.courseId }
  ));
  return rows.map((row: any) => ({
    ...toCamelCase<Year>(row),
    courseTitle: row.courses?.name ?? "",
  }));
}

// courseTitle is a UI-only display field (joined in getYears) - not a column.

export async function addYear(data: YearInput) {
  const { courseTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).insert(toSnakeCase(payload));
  if (error) throw error;
}

export async function updateYear(id: string, data: YearInput) {
  const { courseTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).update(toSnakeCase(payload)).eq("id", id).select("id").single();
  if (error) throw error;
}

export async function deleteYear(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id).select("id").single();
  if (error) throw error;
}
