export interface Note {
  id: string;
  title: string;
  pdfUrl: string;

  chapterId: string;
  chapterTitle: string;

  order: number;
  active: boolean;
  // Server-enforced free preview (is_free_preview, 20260924150000).
  isFreePreview?: boolean;
  createdAt?: any;

  // Both added by 20260919120000_multi_course_and_referrals.sql - notes
  // previously had neither column. See types/course.ts.
  yearId: string;
  courseId: string;
  courseTitle?: string;
}

export type NoteInput = Omit<Note, "id" | "createdAt">;
