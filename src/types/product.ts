// Firestore collection: "products"
//
// Product-based split (Notes = paid, Videos/Quiz = free) has landed:
// every product here is a Notes package at the chapter/subject/year/bundle
// level. Videos and QuizTest no longer carry a productId (see types/video.ts,
// types/quiz.ts) - they're free and keyed only by subjectId/yearId.
export type ProductScope = "chapter" | "subject" | "year" | "bundle";

export interface Product {
  id: string;

  title: string;
  description: string;

  scope: ProductScope;

  price: number;
  // Optional "struck-through" MRP shown next to `price` on poster-style
  // cards (Store, Buy Notes) when it's higher than `price` - lets us show
  // a "was ₹X, now ₹Y" discount look. Not set by anything yet; add it in
  // the admin panel / Firestore doc whenever a discount should be shown.
  originalPrice?: number;
  active: boolean;

  chapterId?: string;

  subjectId?: string;
  subjectTitle?: string;

  yearId?: string;
  yearTitle?: string;

  yearIds?: string[];
}
