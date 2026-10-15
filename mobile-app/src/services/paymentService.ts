import { supabase } from "../config/supabase";
import { Platform } from "react-native";
import * as Application from "expo-application";

// Supabase Edge Functions that back the payment flow (see
// supabase/functions/{create-order,verify-payment}).
// Deployed with e.g. `supabase functions deploy create-order`.
const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const CREATE_ORDER_URL = `${projectUrl}/functions/v1/create-order`;

export interface CheckoutData {
  keyId: string;
  isLiveMode?: boolean;
  razorpayOrderId: string;
  amountPaise: number;
  productTitle: string;
  internalOrderId: string;
  verifyUrl: string;
  prefillName?: string;
  prefillEmail?: string;
  timeoutSeconds?: number;
  // Display only; the amount actually charged is amountPaise.
  breakdown?: {
    listPrice: number;
    referralDiscount: number;
    walletAmount: number;
    amount: number;
  };
}

export interface VerifyResult {
  success: boolean;
  title?: string;
  message?: string;
  productTitle?: string;
  amount?: number;
  orderId?: string;
}

/**
 * Fetches everything PaymentCheckoutScreen needs to open Razorpay
 * Checkout in its WebView.
 *
 * BUG FIX: this used to open the old "pay" URL in the device's external
 * browser (Linking.openURL) and let that hosted page run the checkout
 * JS. Supabase Edge Functions only serve real HTML/JS on a paid custom
 * domain - on this project's default *.supabase.co domain, GET requests
 * returning text/html get rewritten to text/plain and any <script> is
 * blocked from executing ("Blocked script execution ... because the
 * document's frame is sandboxed and the 'allow-scripts' permission is
 * not set" - see the Supabase docs on Edge Function limits). That
 * silently killed the entire checkout script, so tapping "Pay" did
 * nothing.
 *
 * Fix: create-order (which replaced "pay") returns JSON (checkout data) instead of an HTML page,
 * fetched here with a normal request, and the actual Razorpay UI is
 * rendered by PaymentCheckoutScreen inside an in-app WebView using HTML
 * built locally in the app (checkoutHtmlTemplate.ts) - never fetched
 * from Supabase, so the restriction above doesn't apply to it.
 *
 * SECURITY: the Supabase access_token is sent only in the Authorization
 * header of an authenticated POST to create-order, never in a URL (URLs
 * end up in browser history, OS "recent links", proxy logs, and server
 * access logs). The product title comes back from create-order itself
 * (server-derived, same as price) as part of CheckoutData, so it doesn't
 * need to be passed in here.
 */
export async function purchaseProduct(
  productId: string,
  useWallet = false,
  ucbOrderId?: string,
  buyerState?: string
): Promise<CheckoutData> {
  if (Platform.OS !== "android") throw new Error("Purchases are available in the Android app.");
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new Error("Please log in before purchasing.");
  }

  // Only the product id and the "use my referral balance" flag are sent - never
  // an amount. The server reads the price from the products table, applies the
  // friend discount and wallet rules, creates the order and the Razorpay order
  // together, and returns the checkout data. The client cannot write to `orders`.
  const res = await fetch(CREATE_ORDER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`, // header, never the URL
      "x-medveda-app-version": Application.nativeApplicationVersion ?? "",
    },
    body: JSON.stringify({
      productId,
      useWallet,
      ...(ucbOrderId ? { ucbOrderId, buyerState } : {}),
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || "Could not start payment. Please try again.");
  }
  return body as CheckoutData;
}

/**
 * Posts the Razorpay callback fields to verify-payment and returns the
 * server's verdict. Called from PaymentCheckoutScreen after the WebView
 * reports a Razorpay success callback - the checkout page's own callback
 * is never trusted on its own, this is what actually confirms and grants
 * the purchase server-side.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyPaymentOnce(
  verifyUrl: string,
  payload: {
    internalOrderId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }
): Promise<VerifyResult> {
  const res = await fetch(verifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json",
      "x-medveda-app-version": Application.nativeApplicationVersion ?? "" },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok && body.success === undefined) {
    // Transport-level/unexpected error shape (missing fields, 500, etc).
    throw new Error(body.error || "Could not verify payment.");
  }

  return body as VerifyResult;
}

/**
 * BUG FIX: switching out to a UPI app (PhonePe/GPay) and back is exactly
 * when Android is most likely to suspend/throttle this screen's network
 * stack for a moment - the payment itself succeeds on Razorpay's side,
 * but this verify call can get dropped in transit right as the app
 * resumes, and the student sees "verification could not be confirmed"
 * even though the payment actually went through fine. Retry a few times
 * with a short, growing delay before actually giving up - almost all of
 * these are transient and resolve within a couple of seconds once the
 * app is back in the foreground.
 */
export async function verifyPayment(
  verifyUrl: string,
  payload: {
    internalOrderId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }
): Promise<VerifyResult> {
  const attempts = [0, 1500, 3000]; // ms delay before each attempt
  let lastError: unknown;

  for (let i = 0; i < attempts.length; i++) {
    if (attempts[i] > 0) await delay(attempts[i]);
    try {
      return await verifyPaymentOnce(verifyUrl, payload);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not verify payment.");
}

/**
 * RECOVERY PATH: used when the WebView's own success callback never made
 * it back to RN - most commonly the WebView's renderer process getting
 * killed by Android while the app was backgrounded for a UPI app switch
 * (PhonePe/GPay), so Checkout's `handler` never got to postMessage even
 * though the payment itself succeeded on Razorpay's side. Sends only
 * internalOrderId (no signature - there isn't one to send), and the
 * server verifies the current JWT and order owner, then checks Razorpay
 * directly for a captured payment on that order.
 * Safe to call speculatively (e.g. on every app-resume while this screen
 * is open and unsettled) - if nothing was actually paid yet, it just
 * returns { success: false }.
 */
export async function recoverPayment(
  verifyUrl: string,
  internalOrderId: string
): Promise<VerifyResult> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Please log in before checking payment status.");
  const res = await fetch(verifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`,
      "x-medveda-app-version": Application.nativeApplicationVersion ?? "" },
    body: JSON.stringify({ internalOrderId, recover: true }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok && body.success === undefined) {
    throw new Error(body.error || "Could not check payment status.");
  }

  return body as VerifyResult;
}

/**
 * BUG FIX: recoverPayment() used to be called exactly once, with no retry.
 * The UPI success callback (and this recovery check that follows a dropped
 * verifyPayment call) can fire the instant the student's UPI app hands
 * control back - but Razorpay's own order->payment status can still say
 * "authorized" for a few seconds before it flips to "captured" (autocapture
 * isn't instantaneous, and is often slower right as the app is resuming
 * from background). A single recoverPayment() call at that exact moment
 * came back { success: false }, and the caller treated that as final -
 * permanently showing "Payment Failed" even though the same payment shows
 * up as "captured" on Razorpay's dashboard moments later, with no way for
 * the app to ever find out.
 *
 * Fix: retry recoverPayment several times with growing delays before
 * giving up, giving Razorpay's own capture process realistic time to
 * finish. Total window here is ~24s, which comfortably covers normal
 * autocapture latency without leaving the student staring at a spinner
 * indefinitely.
 */
export async function recoverPaymentWithRetry(
  verifyUrl: string,
  internalOrderId: string
): Promise<VerifyResult> {
  const attempts = [0, 2000, 3000, 5000, 6000, 8000]; // ms delay before each attempt (~24s total)
  let lastResult: VerifyResult = { success: false };

  for (let i = 0; i < attempts.length; i++) {
    if (attempts[i] > 0) await delay(attempts[i]);
    try {
      lastResult = await recoverPayment(verifyUrl, internalOrderId);
      if (lastResult.success) return lastResult;
    } catch {
      // Transient network hiccup on this attempt - keep trying.
    }
  }

  return lastResult;
}
