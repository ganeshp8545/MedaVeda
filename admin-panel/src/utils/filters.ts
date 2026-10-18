import type { ContentFilters } from "../types/filters";

// Applies the optional course/year filters to a Supabase query builder.
// Pass { year: false } for tables whose year_id doesn't mean "the year this
// row belongs to" (products: year_id is only the scope='year' target).
// The builder is typed loosely on purpose - Supabase's chained generics
// don't survive being threaded through a helper.
export function applyContentFilters(
  query: any,
  filters: ContentFilters = {},
  opts: { year?: boolean } = {}
): any {
  let q = query;
  if (filters.courseId) q = q.eq("course_id", filters.courseId);
  if (filters.yearId && opts.year !== false) q = q.eq("year_id", filters.yearId);
  return q;
}

// PostgREST caps a single response at the project's configured max rows.
// Create a fresh builder for each page so filters and ordering stay identical.
export async function fetchAllPages<T>(makeQuery: () => any, pageSize = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await makeQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

// Form state uses "" for "not chosen yet". A blank courseId/yearId must be
// left out of the payload so the DB triggers derive it from the parent -
// sending "" would be rejected as a mismatch (or an FK violation).
export function omitBlankIds<T extends Record<string, any>>(
  payload: T,
  keys: string[] = ["courseId", "yearId"]
): Partial<T> {
  const out: Record<string, any> = { ...payload };
  for (const key of keys) {
    if (out[key] === "" || out[key] === undefined) delete out[key];
  }
  return out as Partial<T>;
}
