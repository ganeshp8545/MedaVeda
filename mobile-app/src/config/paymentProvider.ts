import Constants from "expo-constants";

export type PaymentProvider = "play" | "razorpay";

const configuredProvider = Constants.expoConfig?.extra?.medvedaPaymentProvider;

export const paymentProvider: PaymentProvider =
  configuredProvider === "razorpay" ? "razorpay" : "play";
