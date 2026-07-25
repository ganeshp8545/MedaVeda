import { fetchWithCacheFallback } from "../utils/localCache";
import {
  getChaptersBySubject,
  getChaptersOrderedByCreatedAt,
  getActiveChapters,
} from "../repositories/chaptersRepository";

export type { Chapter } from "../types/chapter";

export async function fetchChaptersBySubject(subjectId: string) {
  return fetchWithCacheFallback(`chapters:${subjectId}`, async () => {
    const chapters = await getChaptersBySubject(subjectId);

    // Sorted client-side (instead of Firestore orderBy) so this query
    // never needs a manual composite index to be created in the console.
    return chapters.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  });
}

// Cross-subject "Latest Updates" for the dashboard. Tries to order by a
// `createdAt` timestamp if the admin panel writes one; if that field or
// its required index isn't there yet, falls back to an unordered slice
// so the section still shows something instead of erroring out.
export async function fetchLatestChapters(max = 6) {
  try {
    return await getChaptersOrderedByCreatedAt(max);
  } catch (error) {
    console.log("fetchLatestChapters: falling back to unordered query", error);
    return getActiveChapters(max);
  }
}

// Simple "Recommended for you" heuristic for the dashboard: chapters the
// user does not already own, preferring the ones the caller marks as
// same-year as the student's most recent activity. Real personalization
// can replace this later without changing the dashboard's contract.
export async function fetchRecommendedChapters(
  ownedChapterIds: Set<string>,
  preferredYearId?: string,
  max = 6
) {
  const all = await getActiveChapters(30);

  const notOwned = all.filter((c) => !ownedChapterIds.has(c.id));

  const sorted = preferredYearId
    ? [
        ...notOwned.filter((c) => c.yearId === preferredYearId),
        ...notOwned.filter((c) => c.yearId !== preferredYearId),
      ]
    : notOwned;

  return sorted.slice(0, max);
}
