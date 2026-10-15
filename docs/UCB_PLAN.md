# MedVeda India User Choice Billing plan

Status: Code implemented, 2026-10-12. Play Console enrollment, live price tiers, deployment and licensed-device validation remain release gates. Existing uncommitted work must be preserved.

## Current flow

```text
Store/Buy Notes -> usePurchase.buy -> OrderSummary
  -> quote_my_order (display quote, optional referral wallet)
  -> create-order {productId,useWallet} + user JWT
  -> create_priced_order SQL (server price, discount, wallet; cancels older created orders)
  -> Razorpay order -> PaymentCheckout WebView
  -> verify-payment callback/recovery OR signed razorpay-webhook
  -> _shared/settle.ts re-fetches Razorpay payment/order
  -> settle_razorpay_payment SQL atomically inserts payment/purchase,
     debits wallet and qualifies referral/credits referrer
  -> PaymentSuccess / PaymentFailed with recovery polling
```

The refund/dispute webhook uses Razorpay IDs and its own SQL reversal routines. There is no `_shared/grantPurchase` today. `payments.razorpay_*` columns are required. `create_priced_order` cancels every older `created` order for the user. The current full-wallet path is disallowed by its cap and minimum ₹1 charge.

## Target flow and contracts

Android purchase start calls **create-play-order** first, then `expo-iap.requestPurchase` for its server-selected SKU. The app connects using `enableBillingProgramAndroid: 'user-choice-billing'` and subscribes to the purchase and user-choice listeners before starting billing. New non-Android builds hide purchase controls. The client never sends price.

| Endpoint | Authenticated request | Response / behavior |
|---|---|---|
| `create-play-order` | `{productId}` + user JWT | Validate profile, course, ownership, active product and exact server price tier. Create `orders(status=created, provider=play, amount=list_price, play_sku)`. Return `{internalOrderId,playSku}`. Return a clear `price_tier_missing` error when no active exact tier exists. |
| `verify-play-purchase` | `{purchaseToken,productId,internalOrderId}` + user JWT | Fetch `purchases.products.get` using **server order SKU**, verify package `in.medveda.app`, SKU, `purchaseState=0`, token's obfuscated account/profile IDs equal deterministic one-way hashes of order user/ID, order ownership/status/price, and token uniqueness. Atomic Play settlement grants the product and referral credit once. Consume the price-tier SKU through `purchases.products.consume` after grant; persist consumption status for retries. Return `{success,internalOrderId,amount,productTitle,pending?}`. A pending purchase never grants. |
| `attach-external-token` | `{internalOrderId,externalTransactionToken}` + user JWT | Validate the open Play-choice order and owner, attach token once; return `{ok:true}`. Never log token. |
| Existing `create-order` | `{productId,useWallet,ucbOrderId?,buyerState?}` + user JWT | For a UCB alternate choice, require the attached token and a buyer-selected Indian state, then perform the **existing** pricing/Razorpay flow. Validate the state against Google's accepted administrative areas and snapshot it on the final order. Atomically transfer/bind the token from the choice order to the new Razorpay order under a lock, checking same user/product/SKU. Return the existing checkout shape. Reject an unbound choice order. Older non-UCB clients retain existing behavior until rollout controls are enabled. |
| `report-external-transaction` | service role/cron only; `{orderId}` for one order or `{phase}` for scheduled `reports`, `refunds`, `consume`, or `reconcile` work | For captured/settled Razorpay order with token, use the immutable server-computed charged amount and tax snapshot, stable `externalTransactionId`, and buyer-selected Indian state; call `externaltransactions.createexternaltransaction`. Record `reported` only after Google confirms. Reconcile already-created ID through `getexternaltransaction` on ambiguous retries. Never accept client price/tax/time/region. |

The `userChoiceBillingListenerAndroid` must validate the selected SKU, persist the token, then navigate into the current OrderSummary. The latter calls `create-order` with `ucbOrderId`; its referral discount and wallet logic stay intact. The Play path charges full Play SKU price without friend discount or partial wallet payment, but successful Play purchases qualify the referrer using the same anti-farming rules. After verification, show the existing confirmation/success UI. On login/app start, call `getAvailablePurchases`, use the app's unresolved order mapping and server verification to re-verify unconsumed purchases. A failed network confirmation stays pending and retries. A genuine cancel leaves no grant. Consumed tokens disappear from Play's available purchases; Supabase purchase rows remain the ownership source. The obfuscated identifiers are deterministic SHA-256 hex digests (64 characters); the server computes them from order values for comparison. This follows current Google guidance over the prompt's raw UUID example.

**Price-tier SKU reuse:** `notes_49` may buy multiple distinct products, so these one-time Play items must be **consumable**. Acknowledging as a non-consumable would make the second purchase of the same price tier impossible. Consume only after server grant and reconcile consumption retries. The Play Console SKU price must equal the corresponding INR product price; block purchase on mismatch/missing SKU. Query the *live* product prices before defining tiers; the repository contains no reliable live price inventory:

```sql
select price, count(*) from public.products
where active and price > 0 group by price order by price;
```

## Database migration

Create idempotent migrations under `supabase/migrations/` that add `play_price_tiers(price_inr,play_sku)` mapping, provider and nullable Play/external reporting fields on orders/payments, Play refund reversal, and a per-refund Google report queue. The owner cannot supply live prices yet: keep `supabase/seed/play_price_tiers.json` empty, load it with a validating script after the live query, and fail clearly on any unmapped product. Use unique indexes for `purchase_token` and `external_transaction_token`, a stable unique external transaction ID, report status/time/error/attempts, and consumption status. Make Razorpay ID fields nullable on Play payment rows with a provider-specific check. Keep `orders.amount` and its Razorpay pricing invariant intact; extend immutability checks to provider, SKU, token and reporting identity. A BEFORE INSERT trigger snapshots configured GST, pre-tax and tax on every new order; later configuration changes cannot alter it. RLS stays enabled; clients cannot write billing tables; only service-role settlement RPCs can mutate grants. Add an atomic Play settlement RPC with equivalent referral anti-farming rules. The existing Razorpay function is left intact to protect discount/wallet behavior; this deliberate deviation from a literal shared grant module is recorded in `UCB_DECISIONS.md`. Add provider-aware refund/revocation SQL; test concurrent duplicate token and cross-user attempts.

## Files

- Backend: three UCB migrations; `supabase/functions/_shared/googlePlay.ts`; `create-play-order/`, `verify-play-purchase/`, `attach-external-token/`, `report-external-transaction/`; changes to `create-order/`, `_shared/settle.ts`, `razorpay-webhook/`; hosted scheduled report/consume/refund sweeper and Play purchase-state polling; `supabase/config.toml` and deployment docs; focused self-tests. RTDN remains a follow-up because authenticated Pub/Sub delivery is not configured here.
- Mobile: `mobile-app/package.json`/lock, `app.json`/`app.config.js`, new `src/services/playBillingService.ts`, `src/hooks/usePurchase.ts`, `OrderSummaryScreen.tsx`, `PaymentCheckoutScreen.tsx`, `PaymentSuccessScreen.tsx`, `PaymentFailedScreen.tsx`, `App.tsx` or authenticated navigation host, payment/order/product/purchase types. Pin an exact `expo-iap` version and compile against its installed types because current docs differ across releases.
- Compliance: `mobile-app/src/screens/terms/TermsScreen.tsx`, `mobile-app/src/screens/privacy/PrivacyScreen.tsx`, `mobile-app/DATA_SAFETY_AUDIT.md`, `mobile-app/PLAY_STORE_SUBMISSION.md`, `website/_src/pages/{terms,privacy-policy,refund-policy}.html` and generated pages, new `docs/UCB_SETUP.md` and `docs/UCB_DECISIONS.md`.

## Secrets and deployment

`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_PACKAGE_NAME`, and a cron invocation secret belong in Supabase secrets. Existing `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` remain server-side. EAS only needs public Supabase config; no Play service-account JSON in the app. Document exact names in `UCB_SETUP.md`. Enroll `in.medveda.app` in India's alternative billing with user choice program, configure Play one-time items and Developer API permissions, test with a licensed tester, then build a native EAS development/production binary; Expo Go cannot host this native module. `razorpay-webhook` remains `--no-verify-jwt` and verifies Razorpay signature; authenticated new endpoints verify JWT. A cron endpoint must authenticate its own secret.

## Risks and gates

1. **Two-order handoff:** transferring the external token must be atomic and safe if Razorpay order creation fails. Do not launch Razorpay checkout until the final order is bound to the token. Retried transfers must return the same binding, never attach one token to two orders.
2. **Tax and region:** The owner confirmed MedVeda currently charges 0% GST and has no invoice/tax source. Store `app_config.gst_rate_percent = 0` and an unset `seller_state`; at UCB Razorpay order creation, snapshot the configured rate, `pre_tax_amount = amount`, `tax_amount = 0`, and the buyer-selected `buyer_state`. Never recompute an old order after the config changes. Google requires the actual pre-tax/tax amounts, completion time, `regionCode = IN`, and `administrativeArea` for Indian external transactions. The owner approved a required Indian state selector before Android Razorpay checkout. Reporting must fail visibly while `buyer_state` is null; never infer one from IP, phone, or email.
3. **24-hour report SLA:** report inline after both `verify-payment` and webhook settlement, then sweep pending/failed rows every few minutes; alert in Sentry and audit unresolved rows. Refunds require Google's `refundexternaltransaction` and a retry path.
4. **Play lifecycle:** pending purchases grant nothing; token replay/cross-user/wrong SKU fail; consume only after grant; retry after app death; refunded/voided purchases revoke access and cancel unvested referral reward. RTDN Pub/Sub requires authenticated push and authoritative Play API re-fetch.
5. **Rollout:** live SKU inventory and prices, India UCB enrollment, tax data source, Google API credentials and a licensed Play tester cannot be verified from this repository. Shipping must wait for those console and end-to-end checks.

## Test plan

Run TypeScript `npx tsc --noEmit`, existing checkout/signature self-tests, new backend contract and SQL idempotency tests. Test same token concurrently, wrong order/user/SKU/package, canceled/pending purchase, duplicate webhook/client settlement, same price-tier SKU for two different products, process death before grant and before consumption, alternate-billing discount/wallet, report retry/duplicate ID, 24-hour backlog alert, full/partial refund, and non-Android purchase controls hidden. On licensed Android tester test Play success, Razorpay success, cancel/failure and restart recovery. Re-review for HIGH payment findings before release.

## Official references checked

- [India enrollment and requirements](https://support.google.com/googleplay/android-developer/answer/13306652)
- [User choice billing in-app integration](https://developer.android.com/google/play/billing/alternative/alternative-billing-with-user-choice-in-app)
- [External transaction backend integration](https://developer.android.com/google/play/billing/outside-gpb-backend)
- [External transaction REST resource](https://developers.google.com/android-publisher/api-ref/rest/v3/externaltransactions)
- [Play product purchases REST resource](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products)
- [Expo IAP listeners](https://hyochan.github.io/expo-iap/api/methods/listeners/), [unified methods](https://hyochan.github.io/expo-iap/api/methods/unified-apis/), [3.4.4 input rename](https://hyochan.github.io/expo-iap/blog/3.4.4-offertoken-naming/)
- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
