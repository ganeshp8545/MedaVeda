import { getVideosBySubject } from "../repositories/videosRepository";

export type { Video } from "../types/video";

export async function fetchVideosBySubject(subjectId: string) {
  const videos = await getVideosBySubject(subjectId);

  // Sorted client-side (instead of Firestore orderBy) so this query
  // never needs a manual composite index to be created in the console.
  return videos.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
