import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "../config/firebase";

export interface Note {
  id: string;
  title: string;
  pdfUrl: string;
  chapterId: string;
  order: number;
}

const notesCollection = collection(db, "notes");

export async function fetchNotesByChapter(chapterId: string): Promise<Note[]> {
  const q = query(
    notesCollection,
    where("chapterId", "==", chapterId),
    where("active", "==", true)
  );

  const snapshot = await getDocs(q);

  const results = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as Note[];

  // Sorted client-side (instead of Firestore orderBy) so this query
  // never needs a manual composite index to be created in the console.
  return results.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
}
