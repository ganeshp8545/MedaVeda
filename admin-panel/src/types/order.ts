export type OrderStatus = "created" | "paid" | "failed" | "refunded";

export interface Order {
  id: string;

  userId: string;
  userName: string;
  userEmail: string;

  productId: string;
  productTitle: string;

  amount: number;
  status: OrderStatus;
  paymentId?: string;

  createdAt?: any;

  // Added by 20260919120000_multi_course_and_referrals.sql, populated
  // server-side (derived from the product, never client-writable) - see
  // types/course.ts. courseTitle is a joined display field, not a real column.
  courseId?: string;
  courseTitle?: string;
}
