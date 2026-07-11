import * as functions from "firebase-functions";

import { handlePay } from "./pay";
import { handleVerifyPayment } from "./verifyPayment";
import { renderErrorPage } from "./pages";

// Explicit region so the deployed URL matches what the mobile app's
// services/paymentService.ts already points at:
//   https://us-central1-ayurpulse-ca8e4.cloudfunctions.net/pay
// Change this (and update the mobile app's PAY_BASE_URL) if you deploy to
// a different region.
const REGION = "us-central1";

const withSecrets = functions
  .region(REGION)
  .runWith({ secrets: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"] });

// GET /pay?productId=...&token=...&title=...
// Opened by the mobile app in an external browser (Linking.openURL).
// Verifies the user, looks up the product, creates a Razorpay order, and
// serves the checkout page.
export const pay = withSecrets.https.onRequest(async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).send(renderErrorPage("Method not allowed."));
    return;
  }
  try {
    await handlePay(req, res);
  } catch (err) {
    console.error("pay: unhandled error", err);
    res.status(500).send(renderErrorPage("Something went wrong. Please try again."));
  }
});

// POST /verifyPayment
// Called by the checkout page's own client-side JS after Razorpay Checkout
// reports success. Re-verifies everything server-side before granting
// access - the checkout page's callback is not itself trusted.
export const verifyPayment = withSecrets.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send(renderErrorPage("Method not allowed."));
    return;
  }
  try {
    await handleVerifyPayment(req, res);
  } catch (err) {
    console.error("verifyPayment: unhandled error", err);
    res.status(500).send(renderErrorPage("Something went wrong verifying your payment."));
  }
});
