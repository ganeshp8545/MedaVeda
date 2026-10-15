import { ProductScope } from "./product";

// Firestore collection: "purchases"
// Written ONLY by the verify-payment Firebase Cloud Function. Each purchase
// doc carries a copy of the product's scope fields, so the app can check
// "do I own this?" with local comparisons instead of re-fetching the product.
export interface OwnedScope {
  status: string;
  scope: ProductScope;
  chapterId?: string;
  subjectId?: string;
  yearId?: string;
  yearIds?: string[];
  // Added by 20260919120000_multi_course_and_referrals.sql - always
  // set, derived server-side from the purchased product. See types/course.ts.
  courseId: string;
}

// Purchase record with display-friendly fields, for the "Purchased
// Packages" section (MyPurchasesScreen). Falls back to a generic label per
// scope if the purchase doc doesn't carry a product title.
export interface MyPurchase {
  id: string;
  title: string;
  scope: ProductScope;
  purchasedAt?: number;

  // Optional - only present once the verify-payment function starts
  // writing them (or for older purchase docs that predate these fields).
  amount?: number;
  status?: "success" | "pending" | "failed" | string;
  orderId?: string;
}
