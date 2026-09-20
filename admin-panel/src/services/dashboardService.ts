import { supabase } from "../config/supabase";
import { applyContentFilters } from "../utils/filters";
import type { ContentFilters } from "../types/filters";

// Tables that carry a course_id. "courses" itself is counted unfiltered.
async function countRows(table: string, courseId?: string) {
  const { count, error } = await applyContentFilters(
    supabase.from(table).select("*", { count: "exact", head: true }),
    { courseId }
  );
  if (error) throw error;
  return count ?? 0;
}

export async function getDashboardStats(filters: ContentFilters = {}) {
  const { courseId } = filters;
  const [courses, years, subjects, products, users, notes, videos, quiz] = await Promise.all([
    countRows("courses"),
    countRows("years", courseId),
    countRows("subjects", courseId),
    countRows("products", courseId),
    countRows("profiles", courseId),
    countRows("notes", courseId),
    countRows("videos", courseId),
    countRows("quiz_tests", courseId),
  ]);

  return { courses, years, subjects, products, users, notes, videos, quiz };
}
