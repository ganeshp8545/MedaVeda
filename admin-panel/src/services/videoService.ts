import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type { Video, VideoInput } from "../types/video";

const TABLE = "videos";

export async function getVideos(): Promise<Video[]> {
  const { data, error } = await supabase.from(TABLE).select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => toCamelCase<Video>(row));
}

// yearTitle / subjectTitle are UI-only display fields - not columns on the
// "videos" table - so they must be stripped before sending to Supabase.
export async function addVideo(data: VideoInput) {
  const { yearTitle, subjectTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).insert(toSnakeCase(payload));
  if (error) throw error;
}

export async function updateVideo(id: string, data: VideoInput) {
  const { yearTitle, subjectTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).update(toSnakeCase(payload)).eq("id", id);
  if (error) throw error;
}

export async function deleteVideo(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
