import { fetchWithCacheFallback } from "../utils/localCache";
import { getSubjectsByYear as getSubjectsByYearFromRepo } from "../repositories/subjectsRepository";

export type { Subject } from "../types/subject";

export async function fetchSubjectsByYear(yearId: string) {
  return fetchWithCacheFallback(`subjects:${yearId}`, async () => {
    const subjects = await getSubjectsByYearFromRepo(yearId);

    // Sorted client-side (instead of Firestore orderBy) so this query
    // never needs a manual composite index to be created in the console.
    return subjects.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  });
}
