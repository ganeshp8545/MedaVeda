import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "../config/firebase";

export interface Video {
  id: string;
  title: string;
  youtubeUrl: string;
  chapterId: string;
  order: number;
}

const videosCollection = collection(db, "videos");

export async function fetchVideosByChapter(
  chapterId: string
): Promise<Video[]> {
  const q = query(
    videosCollection,
    where("chapterId", "==", chapterId),
    where("active", "==", true)
  );

  const snapshot = await getDocs(q);

  const results = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as Video[];

  // Sorted client-side (instead of Firestore orderBy) so this query
  // never needs a manual composite index to be created in the console.
  return results.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
}
