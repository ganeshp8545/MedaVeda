// A Product is a sellable item ("SKU"). Its `scope` decides what buying it
// unlocks for a student:
//   chapter -> unlocks just one Chapter (its Notes + Videos)
//   subject -> unlocks every Chapter under one Subject
//   year    -> unlocks every Subject/Chapter under one Year
//   bundle  -> unlocks every Year listed in yearIds (2 or 3 year combos)
//
// Note: MCQ Quiz Tests are NOT gated by any Product - they're always free
// and available to every student at the Subject level (see types/quiz.ts).
export type ProductScope = "chapter" | "subject" | "year" | "bundle";

export interface Product {
  id: string;

  title: string;
  description: string;
  scope: ProductScope;

  price: number;
  // Optional "struck-through" MRP shown next to `price` on the mobile
  // app's poster-style cards (Store, Buy Notes) whenever it's higher
  // than `price` - shows a "M.R.P. ₹X (Y% off)" discount look. Leave
  // blank/0 to hide the discount and show only the plain price.
  originalPrice?: number;
  thumbnail: string;

  // Only the field(s) matching `scope` are meaningful:
  chapterId?: string;
  chapterTitle?: string;

  subjectId?: string;
  subjectTitle?: string;

  yearId?: string;
  yearTitle?: string;

  // Only for scope: "bundle" - 2 or 3 year ids combined into one pack.
  yearIds?: string[];
  yearTitles?: string[];

  active: boolean;
  createdAt?: any;
}

export type ProductInput = Omit<Product, "id" | "createdAt">;
