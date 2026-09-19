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
}
