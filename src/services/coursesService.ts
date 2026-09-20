import { fetchWithCacheFallback } from "../utils/localCache";
import { getActiveCourses } from "../repositories/coursesRepository";

export type { Course } from "../types/course";

export async function fetchCourses() {
  return fetchWithCacheFallback("courses", async () => {
    const courses = await getActiveCourses();
    return courses.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  });
}
