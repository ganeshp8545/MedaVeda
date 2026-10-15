import { useNavigation } from "@react-navigation/native";
import { Platform } from "react-native";

import { Product } from "../services/productsService";
import { paymentProvider } from "../config/paymentProvider";

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
  // Kept so existing callers (`purchasing` spinners) still compile; starting a
  // payment now happens on the summary screen.
  const purchasing = false;
  const navigation = useNavigation<any>();

  // Opens the order summary (price, friend discount, optional referral balance).
  // The order itself is only created when the student taps Pay there, so
  // nothing is reserved or discounted by merely looking at the summary.
  function buy(product: Product) {
    if (Platform.OS !== "android") return;
    navigation.navigate(paymentProvider === "play" ? "PlayBilling" : "OrderSummary", {
      productId: product.id,
      productTitle: product.title,
    });
  }

  return { buy, purchasing };
}
