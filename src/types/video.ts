// Firestore collection: "videos"
//
// Product-based split: Video Lectures are always free, so they no longer
// need a chapterId - they're organized (and fetched) at the Subject level
// only, same as the free/paid boundary described in the roadmap.
export interface Video {
  id: string;
  title: string;
  youtubeUrl: string;
  subjectId: string;
  subjectTitle: string;
  yearId: string;
  yearTitle: string;
  order: number;
}
