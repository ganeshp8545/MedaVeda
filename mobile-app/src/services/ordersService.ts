import { getCurrentUser } from "./authState";
import { getOrderById, getOrdersByUser } from "../repositories/ordersRepository";
import { Order, OrderStatus } from "../types/order";

export type { Order, OrderStatus } from "../types/order";

// Used by MyPurchasesScreen / a future "Order History" section to show
// every attempt (created/paid/failed/cancelled), not just successful
// purchases - purchasesService.fetchMyPurchases only ever sees the
// successful ones the Edge Function wrote to `purchases`.
export async function fetchMyOrders(): Promise<Order[]> {
  const uid = getCurrentUser()?.id;
  if (!uid) return [];

  const orders = await getOrdersByUser(uid);
  return orders.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export async function fetchOrder(orderId: string): Promise<Order | null> {
  return getOrderById(orderId);
}

// Orders are created by the create-order Edge Function and settled by the
// payment system only; clients have no write access to `orders`. Kept as a
// no-op so existing call sites (e.g. PaymentCheckoutScreen) need no change - an
// abandoned order simply stays "created".
export async function markOrderStatus(
  _orderId: string,
  _status: OrderStatus,
  _extra?: Partial<Pick<Order, "razorpayOrderId" | "razorpayPaymentId">>
): Promise<void> {}
