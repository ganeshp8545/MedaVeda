import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { db } from "../config/firebase";
import { fetchWithCacheFallback } from "../utils/localCache";

export interface Chapter {
  id: string;
  title: string;
  order: number;
  active: boolean;
  subjectId: string;
  subjectTitle: string;
  yearId: string;
  yearTitle: string;
}

const chaptersCollection = collection(db, "chapters");

export async function fetchChaptersBySubject(
  subjectId: string
): Promise<Chapter[]> {
  return fetchWithCacheFallback(`chapters:${subjectId}`, async () => {
    const q = query(
      chaptersCollection,
      where("subjectId", "==", subjectId),
      where("active", "==", true)
    );

    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as Chapter[];

    // Sorted client-side so this never needs a Firestore composite index.
    return results.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  });
}

// Cross-subject "Latest Updates" for the dashboard. Tries to order by a
// `createdAt` timestamp if the admin panel writes one; if that field or
// its required index isn't there yet, falls back to an unordered slice
// so the section still shows something instead of erroring out.
export async function fetchLatestChapters(max = 6): Promise<Chapter[]> {
  try {
    const q = query(
      chaptersCollection,
      where("active", "==", true),
      orderBy("createdAt", "desc"),
      limit(max)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as Chapter[];
  } catch (error) {
    console.log("fetchLatestChapters: falling back to unordered query", error);
    const q = query(chaptersCollection, where("active", "==", true), limit(max));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as Chapter[];
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
): Promise<Chapter[]> {
  const q = query(chaptersCollection, where("active", "==", true), limit(30));
  const snapshot = await getDocs(q);

  const all = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as Chapter[];

  const notOwned = all.filter((c) => !ownedChapterIds.has(c.id));

  const sorted = preferredYearId
    ? [
        ...notOwned.filter((c) => c.yearId === preferredYearId),
        ...notOwned.filter((c) => c.yearId !== preferredYearId),
      ]
    : notOwned;

  return sorted.slice(0, max);
}
