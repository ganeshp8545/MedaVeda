import { useEffect, useState } from "react";
import type { ContentFilters } from "../types/filters";

import {
  addQuizTest,
  deleteQuizTest,
  getQuizTests,
  updateQuizTest,
} from "../services/quizService";

import type { QuizTest, QuizTestInput } from "../types/quiz";

export default function useQuiz(filters: ContentFilters = {}) {
  const [tests, setTests] = useState<QuizTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTests();
  }, [filters.courseId, filters.yearId]);

  async function loadTests() {
    try {
      setLoading(true);
      const data = await getQuizTests(filters);
      setTests(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load quiz tests. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function createTest(data: QuizTestInput) {
    await addQuizTest(data);
    await refreshAfterMutation();
  }

  async function editTest(id: string, data: QuizTestInput) {
    await updateQuizTest(id, data);
    await refreshAfterMutation();
  }

  async function removeTest(id: string) {
    await deleteQuizTest(id);
    await refreshAfterMutation();
  }

  async function refreshAfterMutation() {
    try {
      const data = await getQuizTests(filters);
      setTests(data);
      setError(null);
    } catch {
      setError("The quiz change succeeded, but the list could not refresh. Reload this page before retrying.");
    }
  }

  return {
    tests,
    loading,
    error,
    reload: refreshAfterMutation,
    createTest,
    editTest,
    removeTest,
  };
}
