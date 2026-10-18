import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type { Video, VideoInput } from "../types/video";
import { applyContentFilters, fetchAllPages, omitBlankIds } from "../utils/filters";
import type { ContentFilters } from "../types/filters";

const TABLE = "videos";

export async function getVideos(filters: ContentFilters = {}): Promise<Video[]> {
  const rows = await fetchAllPages<any>(() => applyContentFilters(
    supabase.from(TABLE).select("*").order("created_at", { ascending: false }).order("id"), filters
  ));
  return rows.map((row) => toCamelCase<Video>(row));
}

// yearTitle / subjectTitle are UI-only display fields - not columns on the
// "videos" table - so they must be stripped before sending to Supabase.
export async function addVideo(data: VideoInput) {
  const { yearTitle, subjectTitle, courseTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).insert(toSnakeCase(omitBlankIds(payload))).select("id").single();
  if (error) throw error;
}

export async function updateVideo(id: string, data: VideoInput) {
  const { yearTitle, subjectTitle, courseTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).update(toSnakeCase(omitBlankIds(payload))).eq("id", id).select("id").single();
  if (error) throw error;
}

export async function deleteVideo(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id).select("id").single();
  if (error) throw error;
}
