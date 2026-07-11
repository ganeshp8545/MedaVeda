import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "../config/firebase";
import { fetchWithCacheFallback } from "../utils/localCache";

export interface Year {
  id: string;
  title: string;
  icon: string;
  color: string;
  order: number;
  active: boolean;
}

const yearsCollection = collection(db, "years");

export async function fetchYears(): Promise<Year[]> {
  return fetchWithCacheFallback("years", async () => {
    const q = query(
      yearsCollection,
      where("active", "==", true)
    );

    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as Year[];

    // Sorted client-side (instead of Firestore orderBy) so this query
    // never needs a manual composite index to be created in the console.
    return results.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  });
}