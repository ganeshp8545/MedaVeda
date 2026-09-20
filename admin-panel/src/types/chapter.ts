export interface Chapter {
  id: string;
  title: string;

  yearId: string;
  yearTitle: string;

  subjectId: string;
  subjectTitle: string;

  order: number;
  active: boolean;
  createdAt?: any;

  // Added by 20260919120000_multi_course_and_referrals.sql - see types/course.ts.
  courseId: string;
  courseTitle?: string;
}

export type ChapterInput = Omit<Chapter, "id" | "createdAt">;
