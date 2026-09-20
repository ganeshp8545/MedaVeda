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
  // Added by 20260919120000_multi_course_and_referrals.sql - see types/course.ts.
  courseId: string;
}
