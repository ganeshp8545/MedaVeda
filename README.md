# AyurPulse Payment Backend (Firebase Cloud Functions)

This replaces the old Supabase Edge Function. It has two HTTPS endpoints:

- **`pay`** (GET) - opened by the mobile app in the device's external
  browser. Verifies the logged-in user, looks up the product's real price
  from Firestore, creates a Razorpay order, and serves a checkout page.
- **`verifyPayment`** (POST) - called by that checkout page's own
  JavaScript once Razorpay reports success. Re-verifies the payment
  signature **server-side** before writing anything - this is the only
  place that ever creates a `purchases` doc (i.e. grants access).

Also included: **`firestore.rules`**, covering every collection the
mobile app + admin panel use. This matters as much as the functions code:
without it, a client could just write itself a `purchases` doc directly
and skip payment entirely, no matter how careful `verifyPayment.ts` is.

## 1. Prerequisites

- A Firebase project on the **Blaze (pay-as-you-go) plan**. This is not
  optional - the free Spark plan blocks Cloud Functions from making
  outbound requests to non-Google APIs, and this function calls Razorpay's
  API. Blaze still has a generous free tier underneath it; you only pay if
  you exceed that.
- Firebase CLI installed and logged in:
  ```
  npm install -g firebase-tools
  firebase login
  ```
- A Razorpay account with API keys (Dashboard -> Settings -> API Keys).
  Start with **Test Mode** keys (`rzp_test_...`) to try the full flow with
  Razorpay's test cards before switching to live keys.

## 2. One-time setup

From this folder (the one with `firebase.json` in it):

```bash
# Confirm this points at your actual project (edit .firebaserc if not)
firebase use ayurpulse-ca8e4

# Store your Razorpay keys as Cloud Functions secrets (never commit these)
firebase functions:secrets:set RAZORPAY_KEY_ID
firebase functions:secrets:set RAZORPAY_KEY_SECRET

# Install dependencies
cd functions
npm install
cd ..
```

## 3. Deploy

```bash
firebase deploy --only functions,firestore:rules
```

The CLI will print the live URL for the `pay` function. It should look
like:

```
https://us-central1-ayurpulse-ca8e4.cloudfunctions.net/pay
```

This must match `PAY_BASE_URL` in the mobile app's
`services/paymentService.ts`. If your project ID or region differs, update
that constant in the mobile app to match what Firebase actually printed.

## 4. Test it end-to-end

1. In the mobile app, log in and tap "Buy" on any product.
2. The external browser should open showing the AyurPulse checkout page
   with the correct price.
3. Pay with a [Razorpay test card](https://razorpay.com/docs/payments/payments/test-card-upi-details/)
   (test mode only - never use a real card against test keys).
4. You should land on a "Payment Successful" page.
5. Back in the app, pull to refresh (or re-open the chapter/Store screen) -
   the purchased content should now show as unlocked.
6. Check Firestore: a new `orders` doc (`status: "paid"`), a `payments`
   doc, and a `purchases` doc should all exist for that user.

## 5. What this does NOT do (by design)

- **Refunds** aren't automated - the admin panel's Orders page lets an
  admin mark an order `"refunded"`, but issuing the actual money-back
  still has to be done from the Razorpay Dashboard. Automating that too
  is a reasonable next step if you want it.
- **Webhooks** aren't used - verification instead happens synchronously
  when the checkout page calls `verifyPayment` right after Razorpay
  Checkout reports success. This is simpler and works well for this flow,
  but it does mean a payment that succeeds while the user's browser tab is
  killed before the callback fires won't get verified automatically.
  Adding a Razorpay webhook as a second, independent verification path is
  the standard way to close that gap if you see it happen in practice.

## 6. File overview

```
firebase.json          - ties functions + firestore.rules together
firestore.rules         - security rules for every collection both apps use
functions/
  package.json
  tsconfig.json
  src/
    admin.ts             - Firebase Admin SDK init (shared)
    types.ts              - Firestore doc shapes (must match both apps)
    razorpay.ts            - Razorpay client + signature verification
    pages.ts                 - HTML templates for the checkout/result pages
    pay.ts                     - GET /pay handler
    verifyPayment.ts            - POST /verifyPayment handler
    index.ts                     - exports, secrets binding, region
```
