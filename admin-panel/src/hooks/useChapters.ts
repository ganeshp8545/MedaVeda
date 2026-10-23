import { useCallback, useEffect, useState } from "react";
import type { ContentFilters } from "../types/filters";

import {
  addChapter,
  deleteChapter,
  getChapters,
  updateChapter,
} from "../services/chapterService";

import type { Chapter, ChapterInput } from "../types/chapter";

export default function useChapters(filters: ContentFilters = {}) {
  const { courseId, yearId } = filters;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadChapters = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getChapters({ courseId, yearId });
      setChapters(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load chapters. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [courseId, yearId]);

  useEffect(() => {
    void loadChapters();
  }, [loadChapters]);

  async function createChapter(data: ChapterInput) {
    await addChapter(data);
    await loadChapters();
  }

  async function editChapter(id: string, data: ChapterInput) {
    await updateChapter(id, data);
    await loadChapters();
  }

  async function removeChapter(id: string) {
    await deleteChapter(id);
    await loadChapters();
  }

  return {
    chapters,
    loading,
    error,
    reload: loadChapters,
    createChapter,
    editChapter,
    removeChapter,
  };
}
