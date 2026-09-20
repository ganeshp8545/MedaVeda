import { useEffect, useState } from "react";

import {
  addCourse,
  deleteCourse,
  getCourses,
  setCourseActive,
  updateCourse,
} from "../services/courseService";

import type { Course, CourseInput } from "../types/course";

export default function useCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCourses();
  }, []);

  async function loadCourses() {
    try {
      setLoading(true);
      const data = await getCourses();
      setCourses(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load courses. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function createCourse(data: CourseInput & { id?: string }) {
    await addCourse(data);
    await loadCourses();
  }

  async function editCourse(id: string, data: CourseInput) {
    await updateCourse(id, data);
    await loadCourses();
  }

  async function toggleCourseActive(id: string, active: boolean) {
    await setCourseActive(id, active);
    await loadCourses();
  }

  async function removeCourse(id: string) {
    await deleteCourse(id);
    await loadCourses();
  }

  return {
    courses,
    loading,
    error,
    reload: loadCourses,
    createCourse,
    editCourse,
    toggleCourseActive,
    removeCourse,
  };
}
