import { Linking } from "react-native";

import { auth } from "../config/firebase";

// Firebase Cloud Function (HTTPS trigger) that serves the checkout page.
// This replaces the previous Supabase Edge Function - it needs to be
// written and deployed separately (Cloud Functions for Firebase, 2nd gen
// or 1st gen HTTPS function named "pay") using the Firebase Admin SDK to
// verify the ID token and write the same purchases/orders/payments docs
// the app already reads from Firestore.
//
// Default region for a 1st-gen HTTPS function is us-central1; update the
// region below if the function is deployed elsewhere.
const PAY_BASE_URL =
  "https://us-central1-ayurpulse-ca8e4.cloudfunctions.net/pay";

/**
 * Opens the hosted checkout page in the device's external browser.
 * Payment happens entirely on the web page (Razorpay Checkout), not inside
 * the app - so there's no in-app purchase / app-store commission involved.
 *
 * This function does NOT resolve with a purchase result - the browser page
 * confirms success on its own. Screens that show "owned" state (Store,
 * Search) re-check ownership via useFocusEffect whenever the user returns
 * to the app, so the unlock appears automatically once payment completes.
 */
export async function purchaseProduct(productId: string, productTitle: string) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please log in before purchasing.");
  }

  const idToken = await user.getIdToken();

  const url =
    `${PAY_BASE_URL}?productId=${encodeURIComponent(productId)}` +
    `&token=${encodeURIComponent(idToken)}` +
    `&title=${encodeURIComponent(productTitle)}`;

  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    throw new Error("Could not open the payment page.");
  }

  await Linking.openURL(url);
}
