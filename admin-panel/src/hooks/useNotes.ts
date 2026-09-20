import { useEffect, useState } from "react";
import type { ContentFilters } from "../types/filters";

import {
  addNote,
  deleteNote,
  getNotes,
  updateNote,
} from "../services/noteService";

import type { Note, NoteInput } from "../types/note";

export default function useNotes(filters: ContentFilters = {}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadNotes();
  }, [filters.courseId, filters.yearId]);

  async function loadNotes() {
    try {
      setLoading(true);
      const data = await getNotes(filters);
      setNotes(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load notes. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function createNote(data: NoteInput) {
    await addNote(data);
    await loadNotes();
  }

  async function editNote(id: string, data: NoteInput) {
    await updateNote(id, data);
    await loadNotes();
  }

  async function removeNote(id: string) {
    await deleteNote(id);
    await loadNotes();
  }

  return {
    notes,
    loading,
    error,
    reload: loadNotes,
    createNote,
    editNote,
    removeNote,
  };
}
