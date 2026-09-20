// Firestore collection: "chapters"
//
// Not in the original roadmap's type list, but added here because Notes,
// Videos, Quiz and Product all currently key off chapterId - keeping this
// out would have left the biggest join-point of the app untyped.
export interface Chapter {
  id: string;
  title: string;
  order: number;
  active: boolean;
  subjectId: string;
  subjectTitle: string;
  yearId: string;
  yearTitle: string;
  // Added by 20260919120000_multi_course_and_referrals.sql - see types/course.ts.
  courseId: string;
}
