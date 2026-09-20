export interface Year {
  id: string;
  title: string;
  icon: string;
  color: string;
  order: number;
  active: boolean;
  createdAt?: any;

  // Added by 20260919120000_multi_course_and_referrals.sql - see types/course.ts.
  courseId: string;
  courseTitle?: string;
}

export type YearInput = Omit<Year, "id" | "createdAt">;
