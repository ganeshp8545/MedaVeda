// Firestore collection: "notes"
export interface Note {
  id: string;
  title: string;
  pdfUrl: string;
  chapterId: string;
  order: number;
}
