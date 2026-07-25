import { getCurrentUser } from "./authState";
import {
  createOrder,
  getOrderById,
  getOrdersByUser,
  updateOrderStatus,
} from "../repositories/ordersRepository";
import { Order, OrderStatus } from "../types/order";
import { Product } from "../types/product";
import { logOrderCreated } from "./analyticsService";

export type { Order, OrderStatus } from "../types/order";

// Step 1 of the Order -> Payment -> Purchase -> Unlock flow (roadmap
// change 5): called by usePurchase.buy() the moment the student taps "Buy
// Now", BEFORE the hosted Razorpay checkout page ever opens. Writing the
// order first (with status "created") means every payment attempt is
// auditable even if the student closes the browser before paying -
// paymentService only has to hand the resulting orderId to the checkout
// page.
//
// BUG FIX: this used to also send `productTitle`, a field with no
// matching column in the `orders` table - every insert failed with
// Postgres error PGRST204 and "Buy Now" silently did nothing (the
// checkout page never got a chance to open). Removed, and replaced with
// the actual scope-identifying fields the table does have -
// chapterId/subjectId/yearId/yearIds - picked based on product.scope,
// same convention the Product type already uses.
export async function createOrderForProduct(product: Product): Promise<Order> {
  const user = getCurrentUser();
  if (!user) {
    throw new Error("Please log in before purchasing.");
  }

  const orderId = await createOrder({
    userId: user.id,
    productId: product.id,
    scope: product.scope,
    amount: product.price,
    status: "created",
    chapterId: product.scope === "chapter" ? product.chapterId : undefined,
    subjectId: product.scope === "subject" ? product.subjectId : undefined,
    yearId: product.scope === "year" ? product.yearId : undefined,
    yearIds: product.scope === "bundle" ? product.yearIds : undefined,
  });

  const order = await getOrderById(orderId);

  if (!order) {
    // Shouldn't happen (we just wrote it), but keep the caller's type
    // narrow instead of returning null.
    throw new Error("Could not create order. Please try again.");
  }

  logOrderCreated({
    orderId: order.id,
    productId: order.productId,
    scope: order.scope,
    amount: order.amount,
  });

  return order;
}

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

// Normally only the verify-payment Edge Function should move an order to
// "paid"/"failed" (it's the only thing that talks to Razorpay's server-side
// verification API), so this is exposed mainly for a "Cancel" button on a
// still-pending order, or for admin tooling - not for the client to fake a
// successful payment.
export async function markOrderStatus(
  orderId: string,
  status: OrderStatus,
  extra?: Partial<Pick<Order, "razorpayOrderId" | "razorpayPaymentId">>
): Promise<void> {
  await updateOrderStatus(orderId, status, extra);
}
