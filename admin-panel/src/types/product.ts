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

// What the product is, for the referral wallet rule (added by
// 20260925100000_phase2_referral_config_and_product_type.sql). Referral
// balance can be used ONLY on "notes" and "notes_bundle" products. Existing
// products start as "other" (wallet off) until tagged here.
export type ProductType = "notes" | "notes_bundle" | "video" | "other";

export interface Product {
  id: string;

  title: string;
  description: string;
  scope: ProductScope;
  productType: ProductType;

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

  // Added by 20260919120000_multi_course_and_referrals.sql. Always set
  // (derived by a DB trigger from whichever of chapterId/subjectId/yearId/
  // yearIds is populated) regardless of scope - see types/course.ts.
  courseId: string;
  courseTitle?: string;
}

export type ProductInput = Omit<Product, "id" | "createdAt">;
