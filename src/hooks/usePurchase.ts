import { useState } from "react";
import { Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { purchaseProduct } from "../services/paymentService";
import { createOrderForProduct, markOrderStatus } from "../services/ordersService";
import { Product } from "../services/productsService";

/**
 * Roadmap change 5 - Order -> Payment -> Purchase -> Unlock:
 * Buy Now now writes an `orders` doc (status "created") BEFORE checkout
 * ever opens, and hands that order's id to paymentService so the "pay"
 * Edge Function verifies against a real order instead of trusting
 * whatever the client sends.
 *
 * BUG FIX: this used to call purchaseProduct() and expect it to open an
 * external browser tab that handled everything on its own (Payment
 * success/failure confirmed only by the PaymentSuccess/PaymentFailed
 * deep links). That page's checkout script never actually ran (Supabase
 * blocks script execution in HTML served from its default domain - see
 * paymentService.ts), so nothing happened after "Buy Now" beyond a blank
 * page opening. purchaseProduct() now returns the checkout data instead
 * of opening a browser, and this hook navigates in-app to
 * PaymentCheckoutScreen, which runs the actual Razorpay checkout in a
 * WebView.
 */
export default function usePurchase() {
  const [purchasing, setPurchasing] = useState(false);
  const navigation = useNavigation<any>();

  async function buy(product: Product) {
    let orderId: string | undefined;

    try {
      setPurchasing(true);

      const order = await createOrderForProduct(product);
      orderId = order.id;

      const checkoutData = await purchaseProduct(order.id, product.id);

      navigation.navigate("PaymentCheckout", checkoutData);
    } catch (err: any) {
      // The order was written but checkout never opened (no session/
      // network issue, product no longer available, etc.) - mark it
      // failed so it doesn't sit as "created" forever and confuse
      // order-history/audit views.
      if (orderId) {
        markOrderStatus(orderId, "failed").catch(() => {});
      }

      Alert.alert("Could Not Start Payment", err?.message || "Please try again.");
    } finally {
      setPurchasing(false);
    }
  }

  return { buy, purchasing };
}
