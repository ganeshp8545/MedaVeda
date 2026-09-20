import { fetchWithCacheFallback } from "../utils/localCache";
import { getActiveYears } from "../repositories/yearsRepository";

export type { Year } from "../types/year";

// courseId scopes the list (and its offline cache entry) to one course;
// omit it only where a course isn't known yet.
export async function fetchYears(courseId?: string) {
  return fetchWithCacheFallback(courseId ? `years:${courseId}` : "years", async () => {
    const years = await getActiveYears(courseId);

    // Sorted client-side (instead of Firestore orderBy) so this query
    // never needs a manual composite index to be created in the console.
    return years.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  });
}
