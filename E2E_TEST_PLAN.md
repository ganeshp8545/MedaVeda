# AyurPulse — Admin ↔ Mobile End-to-End Test Plan

Run this after deploying the payment-gateway functions and applying the
mobile 2.0 migration. Use Razorpay **Test Mode** keys throughout — never
test with live keys.

## 0. Pre-flight

- [ ] `node scripts/verify-signature-selftest.js` prints 4x `OK` (proves the
      signature logic itself is correct, before touching real payments)
- [ ] `firebase deploy --only functions` succeeded, `createOrder`,
      `verifyPayment`, `razorpayWebhook` all show up in Firebase Console →
      Functions
- [ ] `firebase deploy --only firestore:rules` succeeded
- [ ] Razorpay Dashboard → Test Mode → webhook URL added, secret matches
      `RAZORPAY_WEBHOOK_SECRET`
- [ ] Admin Panel → Settings → "Razorpay Key ID" filled with the **test**
      key (`rzp_test_...`), same value as the `RAZORPAY_KEY_ID` secret

## 1. Admin side setup (creates what mobile will sell)

1. [ ] Admin → Years → create "First Year" (active ✅)
2. [ ] Admin → Subjects → create "Anatomy" under First Year (active ✅)
3. [ ] Admin → Products → create "Anatomy Complete Package", type
       `subject`, price ₹1 (use ₹1 for test mode, not ₹399, to keep test
       payments cheap), link to First Year / Anatomy, active ✅
4. [ ] Admin → Notes → add 1-2 notes with a real PDF URL, `productId` =
       the product above, active ✅
5. [ ] Admin → Videos → add 1 video with a YouTube URL, same `productId`
6. [ ] Admin → Quiz → add 2-3 questions, same `productId`

**Check:** Firestore console shows the `products`, `notes`, `videos`,
`quiz` docs all correctly cross-referencing the same `productId`.

## 2. Mobile happy path

1. [ ] Log into the mobile app as a test student
2. [ ] Home → First Year → Anatomy → **Store** screen shows "Anatomy
       Complete Package — ₹1" (not "Open")
3. [ ] Tap it → Razorpay Checkout sheet opens with amount ₹1
4. [ ] Pay with a Razorpay test card (e.g. `4111 1111 1111 1111`, any
       future expiry/CVV) or test UPI
5. [ ] On success, app navigates to Product Details automatically
6. [ ] Notes / Videos / Quiz tiles all show the content added in step 1
7. [ ] Go back to Store screen → same product now shows "Open" badge, not
       the price
8. [ ] **Admin → Orders page** → new row appears: status `paid`, correct
       student name/email, correct amount and product title

## 3. Duplicate purchase guard

1. [ ] From Store screen, tap the now-owned product again
2. [ ] Expected: navigates straight to Product Details, Razorpay never
       opens again (owned products skip `createOrder`)
3. [ ] (Optional stress test) Manually call `createOrder` again for the
       same product/user via Firebase console function tester → expect
       `already-exists` error, not a second order

## 4. Failure / edge paths

| Scenario | Steps | Expected result |
|---|---|---|
| User cancels checkout | Tap Buy, close the Razorpay sheet without paying | No alert shown (usePurchase silently ignores cancellation), no order marked paid, Firestore order stays `pending` |
| Card declined | Use Razorpay's test decline card | Razorpay shows its own failure screen; Firestore order stays `pending`; webhook later flips it to `failed` if Razorpay sends `payment.failed` |
| App killed right after paying | Pay, then force-close the app before `verifyPayment` can run | Within a few seconds, `razorpayWebhook` should still mark the order `paid` and create the `purchases` doc — check Admin Orders page updates even though the app never called verify |
| Tampered signature | Not user-triggered — covered by `verify-signature-selftest.js` in section 0 | Confirms backend would reject a forged payment confirmation |
| Inactive product | Admin sets a product to inactive | Store screen no longer lists it (query filters `active == true`) |

## 5. Search screen

1. [ ] Mobile → Search tab → type "Anatomy"
2. [ ] "Anatomy Complete Package" appears with correct price/owned state
3. [ ] Tapping it behaves identically to tapping it on the Store screen
       (buys if not owned, opens Product Details if owned)

## 6. Firestore rules sanity check

Using the Firebase console **Rules Playground** (or a quick authenticated
client call), confirm:

- [ ] A logged-in student CAN read their own `orders` and `purchases` docs
- [ ] A logged-in student CANNOT write/update any `orders` or `purchases`
      doc directly (e.g. can't set their own order to `status: "paid"`)
- [ ] A logged-in student CAN read `products` (needed for Store/Search to
      work) but CANNOT write them

## 7. Regression check on existing Admin features

- [ ] Years/Subjects/Products CRUD in Admin still works unaffected
- [ ] Users page still lists/blocks users
- [ ] Analytics/Dashboard pages still load (they don't depend on anything
      changed here)

---

Once every box above is checked with test-mode keys, switch
`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / the Admin Settings key to your
**live** Razorpay keys and re-run section 2 once with a real small-value
product before going fully live.
