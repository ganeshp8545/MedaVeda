import { fetchWithCacheFallback } from "../utils/localCache";
import { getActiveYears } from "../repositories/yearsRepository";

export type { Year } from "../types/year";

export async function fetchYears() {
  return fetchWithCacheFallback("years", async () => {
    const years = await getActiveYears();

    // Sorted client-side (instead of Firestore orderBy) so this query
    // never needs a manual composite index to be created in the console.
    return years.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  });
}
