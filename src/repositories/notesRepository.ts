import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "../config/firebase";

export async function getNotes(
  subject: string,
  year: string
) {
  const q = query(
    collection(db, "notes"),
    where("subject", "==", subject),
    where("year", "==", year)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}