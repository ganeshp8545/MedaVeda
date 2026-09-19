export interface Note {
  id: string;
  title: string;
  pdfUrl: string;

  chapterId: string;
  chapterTitle: string;

  order: number;
  active: boolean;
  createdAt?: any;
}

export type NoteInput = Omit<Note, "id" | "createdAt">;
