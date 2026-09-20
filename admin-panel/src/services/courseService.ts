import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type { Course, CourseInput } from "../types/course";

const TABLE = "courses";

export async function getCourses(): Promise<Course[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<Course>(row));
}

// courses.id has a server-side default, so a blank id is omitted rather than
// sent as "" (the seeded courses use readable ids like 'bams').
function toPayload(data: CourseInput & { id?: string }) {
  const { id, ...rest } = data;
  return toSnakeCase(id ? { id, ...rest } : rest);
}

function friendlyCourseError(error: any): Error {
  // 23505 = unique violation (courses_code_unique_ci or the primary key).
  if (error?.code === "23505") {
    return new Error("A course with this code already exists. Course codes must be unique.");
  }
  return error;
}

export async function addCourse(data: CourseInput & { id?: string }) {
  const { error } = await supabase.from(TABLE).insert(toPayload(data));
  if (error) throw friendlyCourseError(error);
}

export async function updateCourse(id: string, data: CourseInput) {
  const { error } = await supabase.from(TABLE).update(toSnakeCase(data)).eq("id", id);
  if (error) throw friendlyCourseError(error);
}

export async function setCourseActive(id: string, active: boolean) {
  const { error } = await supabase.from(TABLE).update({ active }).eq("id", id);
  if (error) throw error;
}

// years.course_id is ON DELETE RESTRICT, so a course with any years can never
// be deleted - the UI should offer "deactivate" instead. Checked up front so
// the admin gets a clear message rather than a raw FK error.
export async function countYearsInCourse(id: string): Promise<number> {
  const { count, error } = await supabase
    .from("years")
    .select("*", { count: "exact", head: true })
    .eq("course_id", id);
  if (error) throw error;
  return count ?? 0;
}

export async function deleteCourse(id: string) {
  const years = await countYearsInCourse(id);
  if (years > 0) {
    throw new Error(
      `This course has ${years} year${years === 1 ? "" : "s"}. Deactivate it instead, or remove its years first.`
    );
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
