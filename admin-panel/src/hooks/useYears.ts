import { useCallback, useEffect, useState } from "react";
import type { ContentFilters } from "../types/filters";

import {
  addYear,
  deleteYear,
  getYears,
  updateYear,
} from "../services/yearService";

import type { Year, YearInput } from "../types/year";

export default function useYears(filters: ContentFilters = {}) {
  const { courseId, yearId } = filters;
  const [years, setYears] = useState<Year[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadYears = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getYears({ courseId, yearId });
      setYears(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load years. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [courseId, yearId]);

  useEffect(() => {
    void loadYears();
  }, [loadYears]);

  async function createYear(data: YearInput) {
    await addYear(data);
    await loadYears();
  }

  async function editYear(id: string, data: YearInput) {
    await updateYear(id, data);
    await loadYears();
  }

  async function removeYear(id: string) {
    await deleteYear(id);
    await loadYears();
  }

  return {
    years,
    loading,
    error,
    reload: loadYears,
    createYear,
    editYear,
    removeYear,
  };
}
