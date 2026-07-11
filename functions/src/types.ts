// These mirror the `Product` type in both the mobile app
// (services/productsService.ts) and the admin panel (types/product.ts) -
// this backend must read/write fields those two already agree on.
export type ProductScope = "chapter" | "subject" | "year" | "bundle";

export interface ProductDoc {
  title: string;
  description?: string;
  scope: ProductScope;
  price: number;
  active: boolean;

  chapterId?: string;
  chapterTitle?: string;

  subjectId?: string;
  subjectTitle?: string;

  yearId?: string;
  yearTitle?: string;

  yearIds?: string[];
  yearTitles?: string[];
}

// Matches the admin panel's `types/order.ts`.
export type OrderStatus = "pending" | "paid" | "failed" | "refunded";

export interface OrderDoc {
  userId: string;
  userName: string;
  userEmail: string;

  productId: string;
  productTitle: string;

  amount: number;
  status: OrderStatus;
  paymentId?: string;

  // Extra fields beyond the admin panel's typed Order interface - harmless
  // since Firestore docs can carry more than a TS interface declares; kept
  // here so this backend can look the order back up during verification
  // without having to re-fetch (and possibly miss) the product doc.
  razorpayOrderId: string;
  scope: ProductScope;
  chapterId?: string;
  subjectId?: string;
  yearId?: string;
  yearIds?: string[];

  createdAt: FirebaseFirestore.FieldValue;
}

// Matches the mobile app's `services/purchasesService.ts` (OwnedScope +
// MyPurchase). `userId` is what fetchOwnedScopes()/fetchMyPurchases()
// query on - it must be named exactly that.
export interface PurchaseDoc {
  userId: string;
  scope: ProductScope;

  chapterId?: string;
  subjectId?: string;
  yearId?: string;
  yearIds?: string[];

  productTitle: string;
  amount: number;
  status: "success";
  orderId: string;
  razorpayOrderId: string;

  createdAt: FirebaseFirestore.FieldValue;
}

// Verification record for auditing - not read by either client app today,
// but keeps a durable record independent of the mutable `orders` doc.
export interface PaymentDoc {
  orderId: string;
  userId: string;
  productId: string;
  amount: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  status: "success";
  verifiedAt: FirebaseFirestore.FieldValue;
}
