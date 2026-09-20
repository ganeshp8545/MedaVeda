// Firestore collection: "notes"
export interface Note {
  id: string;
  title: string;
  pdfUrl: string;
  chapterId: string;
  order: number;
  // Both added by 20260919120000_multi_course_and_referrals.sql - notes
  // previously had neither column, denormalized from the chapter's own
  // yearId/courseId. See types/course.ts.
  yearId: string;
  courseId: string;
  // Server-enforced free preview (notes.is_free_preview, 20260924150000). The
  // get-note-url Edge Function is what actually allows/denies the file.
  isFreePreview?: boolean;
}
