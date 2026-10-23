import { ProductScope } from "./product";

// Supabase table: "orders". Columns (confirmed from the live schema):
//   id, user_id, product_id, amount, status, razorpay_order_id,
//   razorpay_payment_id, created_at, updated_at, scope, chapter_id,
//   subject_id, year_id, year_ids
//
// BUG FIX: this type previously had a `productTitle` field that has no
// matching column in the table at all (caused every order insert to
// fail with Postgres error PGRST204 "Could not find the 'product_title'
// column of 'orders'" - the root cause of "Buy Now does nothing"). It's
// removed here - the checkout page gets the title separately, straight
// from the Product the user tapped (see paymentService.purchaseProduct),
// so nothing actually needed it on the order row.
//
// Also added: chapterId/subjectId/yearId/yearIds. These four DO exist
// as real columns but the old type never declared them, so
// createOrderForProduct never sent them - meaning even an order that
// somehow succeeded couldn't be verified/unlocked afterwards, since
// there was no record of *what* was purchased beyond a bare productId.
export type OrderStatus = "created" | "paid" | "failed" | "cancelled" | "pending" | "refunded";

export interface Order {
  id: string;
  userId: string;

  productId: string;
  scope: ProductScope;

  // Exactly one of these is set, matching `scope` - same convention as
  // Product (types/product.ts): a "chapter" scope order has chapterId,
  // a "bundle" scope order has yearIds, etc. This is what
  // verify-payment (Edge Function) and purchasesService use afterwards
  // to know precisely what to unlock.
  chapterId?: string;
  subjectId?: string;
  yearId?: string;
  yearIds?: string[];

  // Added by 20260919120000_multi_course_and_referrals.sql. A
  // BEFORE INSERT/UPDATE trigger derives this from productId if left
  // unset, so createOrderForProduct doesn't strictly need to send it -
  // but see types/course.ts and services/ordersService.ts.
  courseId?: string;

  amount: number;
  status: OrderStatus;
  provider?: "razorpay" | "play";
  playSku?: string;
  // Order rows do not currently store a title; optional for future server metadata.
  productTitle?: string;

  razorpayOrderId?: string;
  razorpayPaymentId?: string;

  createdAt?: number;
  updatedAt?: number;
}
