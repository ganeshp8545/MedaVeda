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
}

export type ChapterInput = Omit<Chapter, "id" | "createdAt">;
