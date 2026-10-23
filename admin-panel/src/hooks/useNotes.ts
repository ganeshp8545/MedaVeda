import { useCallback, useEffect, useState } from "react";
import type { ContentFilters } from "../types/filters";

import {
  addNote,
  deleteNote,
  getNotes,
  updateNote,
} from "../services/noteService";

import type { Note, NoteInput } from "../types/note";

export default function useNotes(filters: ContentFilters = {}) {
  const { courseId, yearId } = filters;
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getNotes({ courseId, yearId });
      setNotes(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load notes. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [courseId, yearId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  async function createNote(data: NoteInput) {
    await addNote(data);
    await refreshAfterMutation();
  }

  async function editNote(id: string, data: NoteInput) {
    await updateNote(id, data);
    await refreshAfterMutation();
  }

  async function removeNote(id: string) {
    await deleteNote(id);
    await refreshAfterMutation();
  }

  async function refreshAfterMutation() {
    try {
      const data = await getNotes(filters);
      setNotes(data);
      setError(null);
    } catch {
      setError("The note change succeeded, but the list could not refresh. Reload this page before retrying.");
    }
  }

  return {
    notes,
    loading,
    error,
    reload: refreshAfterMutation,
    createNote,
    editNote,
    removeNote,
  };
}
