import Constants from "expo-constants";
import { Platform } from "react-native";

export type PaymentProvider = "play" | "razorpay" | "disabled";

const configuredProvider = Constants.expoConfig?.extra?.medvedaPaymentProvider;

export const paymentProvider: PaymentProvider =
  configuredProvider === "disabled" ? "disabled" :
  Platform.OS === "android" ? "play" : configuredProvider === "razorpay" ? "razorpay" : "play";
