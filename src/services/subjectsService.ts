import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "../config/firebase";
import { fetchWithCacheFallback } from "../utils/localCache";

export interface Subject {
  id: string;
  title: string;
  icon: string;
  color: string;
  yearId: string;
  yearTitle: string;
  order: number;
  active: boolean;
}

const subjectsCollection = collection(db, "subjects");

export async function fetchSubjectsByYear(yearId: string): Promise<Subject[]> {
  return fetchWithCacheFallback(`subjects:${yearId}`, async () => {
    const q = query(
      subjectsCollection,
      where("yearId", "==", yearId),
      where("active", "==", true)
    );

    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as Subject[];

    // Sorted client-side (instead of Firestore orderBy) so this query
    // never needs a manual composite index to be created in the console.
    return results.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  });
}
