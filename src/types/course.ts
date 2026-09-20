// Supabase table: "courses" (added by
// 20260919120000_multi_course_and_referrals.sql). Sits above "years" -
// every Year/Subject/Chapter/Note/Video/QuizTest/Product/Order/Purchase
// now carries a courseId (see types/year.ts etc.) scoping it to one of
// these.
export interface Course {
  id: string;
  name: string;
  code: string;
  description?: string;
  icon?: string;
  displayOrder: number;
  active: boolean;
}
