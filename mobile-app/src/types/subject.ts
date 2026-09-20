// Firestore collection: "subjects"
export interface Subject {
  id: string;
  title: string;
  icon: string;
  color: string;
  yearId: string;
  yearTitle: string;
  order: number;
  active: boolean;
  // Added by 20260919120000_multi_course_and_referrals.sql - see types/course.ts.
  courseId: string;
}
