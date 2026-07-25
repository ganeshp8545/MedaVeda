import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import { Video } from "../types/video";

export async function getVideosBySubject(subjectId: string): Promise<Video[]> {
  const { data, error } = await supabase
    .from("videos")
    // "videos" only stores subject_id/year_id - subjectTitle/yearTitle are
    // UI-only fields the admin panel never writes to the DB, so they must
    // be joined live here (otherwise they show blank wherever a Video is
    // listed outside its own Subject screen, e.g. Search, Downloads).
    .select("*, subjects ( title ), years ( title )")
    .eq("subject_id", subjectId)
    .eq("active", true);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...toCamelCase<Video>(row),
    subjectTitle: row.subjects?.title ?? "",
    yearTitle: row.years?.title ?? "",
  }));
}

// Global Search System - every active video across every subject, for
// the search index. Same join as getVideosBySubject, just without the
// subject_id filter.
export async function getAllActiveVideos(): Promise<Video[]> {
  const { data, error } = await supabase
    .from("videos")
    .select("*, subjects ( title ), years ( title )")
    .eq("active", true);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...toCamelCase<Video>(row),
    subjectTitle: row.subjects?.title ?? "",
    yearTitle: row.years?.title ?? "",
  }));
}
