import { useEffect, useState } from "react";

import {
  addYear,
  deleteYear,
  getYears,
  updateYear,
} from "../services/yearService";

import type { Year, YearInput } from "../types/year";

export default function useYears() {
  const [years, setYears] = useState<Year[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadYears();
  }, []);

  async function loadYears() {
    try {
      setLoading(true);
      const data = await getYears();
      setYears(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load years. Please try again.");
    } finally {
      setLoading(false);
    }
  }

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
