import { useEffect, useState } from "react";
import type { ContentFilters } from "../types/filters";

import {
  addSubject,
  deleteSubject,
  getSubjects,
  updateSubject,
} from "../services/subjectService";

import type { Subject, SubjectInput } from "../types/subject";

export default function useSubjects(filters: ContentFilters = {}) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSubjects();
  }, [filters.courseId, filters.yearId]);

  async function loadSubjects() {
    try {
      setLoading(true);
      const data = await getSubjects(filters);
      setSubjects(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load subjects. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function createSubject(data: SubjectInput) {
    await addSubject(data);
    await loadSubjects();
  }

  async function editSubject(id: string, data: SubjectInput) {
    await updateSubject(id, data);
    await loadSubjects();
  }

  async function removeSubject(id: string) {
    await deleteSubject(id);
    await loadSubjects();
  }

  return {
    subjects,
    loading,
    error,
    reload: loadSubjects,
    createSubject,
    editSubject,
    removeSubject,
  };
}
