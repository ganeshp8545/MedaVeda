import { getNotesByChapter } from "../repositories/notesRepository";

export type { Note } from "../types/note";

export async function fetchNotesByChapter(chapterId: string) {
  const notes = await getNotesByChapter(chapterId);

  // Sorted client-side (instead of Firestore orderBy) so this query
  // never needs a manual composite index to be created in the console.
  return notes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
