import { useState } from "react";
import { Alert } from "react-native";

import { purchaseProduct } from "../services/paymentService";

export default function usePurchase() {
  const [purchasing, setPurchasing] = useState(false);

  async function buy(productId: string, productTitle: string) {
    try {
      setPurchasing(true);
      await purchaseProduct(productId, productTitle);
    } catch (err: any) {
      Alert.alert("Could Not Start Payment", err?.message || "Please try again.");
    } finally {
      setPurchasing(false);
    }
  }

  return { buy, purchasing };
}
