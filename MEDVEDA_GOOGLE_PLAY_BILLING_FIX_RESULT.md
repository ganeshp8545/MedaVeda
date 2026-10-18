# MedVeda Google Play Billing fix result

**Date:** 2026-10-15 UTC  
**Application ID:** `in.medveda.app`  
**Decision:** **NO-GO** for licensed payment testing or production release until the external gates below pass.  
**Scope:** Local, non-pricing source fixes and local verification. No cloud build, AAB upload, hosted deployment, Console change, migration push, real payment, price change, or Admin Panel change was made.

## A. Executive Summary

The original audit recorded **0 critical, 5 high, 4 medium, and 1 low** findings. This pass implemented a Play/Razorpay OTA runtime boundary, removed Razorpay checkout screens from the Play navigation stack, made standard Buy-option selection tolerate other eligible offer types while retaining exact-price checks, made restore continue after an individual receipt lookup error, and corrected the informational FAQ. Local tests passed. The checked-in Play price-tier seed is still empty and was intentionally left unchanged. A real AAB, hosted backend, Play Console catalog, and licensed transaction are still unverified.

| Release state | Result |
|---|---|
| SOURCE CODE READY | **Partial:** the implemented non-pricing changes pass local checks; pricing/catalog and native artifact gates remain. |
| LOCAL TESTS PASSED | **Yes**, for the tests listed in M. |
| AAB VERIFIED | **No**; no final AAB was available. |
| SUPABASE HOSTED VERIFIED | **No**; only disposable local PostgreSQL and mock tests ran. |
| PLAY CONSOLE VERIFIED | **No**. |
| LICENSED TEST PURCHASE PASSED | **No**; no live purchase was run. |
| PRODUCTION READY | **No**. |

## B. Original Audit Findings

Issue IDs, severities, and causes below are from [MEDVEDA_GOOGLE_PLAY_BILLING_ONLY_AUDIT.md](MEDVEDA_GOOGLE_PLAY_BILLING_ONLY_AUDIT.md), section N. “Fixed” counts refer to local implementation, not to production verification.

| ID | Severity | Reconfirmed evidence | Result |
|---|---|---|---|
| GP-01 | HIGH | [play_price_tiers.json](supabase/seed/play_price_tiers.json) contains `tiers: []`; `create_play_order` requires an active tier in [google_play_ucb.sql](supabase/migrations/20261012100000_google_play_ucb.sql). Hosted tiers and Console prices are unknown. | **BLOCKED - OWNER ACTION REQUIRED**; pricing/catalog inspection only, no price or tier edit. |
| GP-02 | HIGH | [expo-iap build.gradle](mobile-app/node_modules/expo-iap/android/build.gradle) requests OpenIAP Google 1.3.26, but no resolved BillingClient dependency graph exists locally. | **BLOCKED - OWNER ACTION REQUIRED**; resolve in an authorized native build environment before upload. |
| GP-03 | HIGH | [expo-iap AndroidManifest.xml](mobile-app/node_modules/expo-iap/android/src/main/AndroidManifest.xml) declares `com.android.vending.BILLING`; no final merged manifest or AAB exists. | **BLOCKED - OWNER ACTION REQUIRED** for final artifact inspection. |
| GP-04 | HIGH | [googlePlay.ts](supabase/functions/_shared/googlePlay.ts) requires hosted credentials; [play_payment_cron_setup.sql](supabase/play_payment_cron_setup.sql) is review-only; hosted function/cron state is unknown. | **BLOCKED - OWNER ACTION REQUIRED** for hosted staging configuration and tests. |
| GP-05 | HIGH | The former provider guard in [app.config.js](mobile-app/app.config.js) only checked EAS build profiles; an OTA publish has no build-profile guard. | **IMPLEMENTED - EXTERNAL VERIFICATION PENDING**; distinct provider runtimes and Play navigation guard pass local checks; inspect actual update/build behavior. |
| GP-06 | MEDIUM | [playOfferSelection.ts](mobile-app/src/services/playOfferSelection.ts) formerly rejected any product with multiple eligible offers. | **PARTIALLY FIXED**; a sole full-price standard Buy option is now selected among other offers, but actual Play ProductDetails and aggregate price behavior need device testing. |
| GP-07 | MEDIUM | [playBillingService.ts](mobile-app/src/services/playBillingService.ts) restores only a receipt tied to the signed-in user and a matching order; one lookup error formerly stopped the pass. | **PARTIALLY FIXED**; receipts are processed independently, while reinstall/account-switch/old receipt recovery needs licensed tests and possibly support resolution. |
| GP-08 | MEDIUM | [FAQ source](website/_src/faq.mjs) and [generated FAQ](website/faq.html) described Razorpay as the app payment route. | **FIXED AND VERIFIED** locally in source, page markup, and FAQ JSON-LD; website publication was not performed. |
| GP-09 | MEDIUM | [snapshot migration](supabase/migrations/20261015120000_play_entitlement_order_snapshot.sql) passes local SQL tests, but hosted migration history and schema are unknown. | **BLOCKED - OWNER ACTION REQUIRED** for read-only hosted inventory and reviewed staging migration plan. |
| GP-10 | LOW | [RELEASE_GATES.md](docs/RELEASE_GATES.md) and [UCB_SETUP.md](docs/UCB_SETUP.md) describe a historical `notes_1` tier while the current checked-in seed is empty. | **UNRESOLVED**; pricing documentation was inspection-only under the requested scope. |

## C. Resolved HIGH Issues

**GP-05 — IMPLEMENTED - EXTERNAL VERIFICATION PENDING.** [app.config.js](mobile-app/app.config.js) now assigns Android runtime version `${app version}-${payment provider}` and retains the Play EAS-profile rejection of Razorpay. Expo public config resolves `1.2.0-play` for Play and `1.2.0-razorpay` for the separate Razorpay build. [AppNavigator.tsx](mobile-app/src/navigation/AppNavigator.tsx) registers `OrderSummary` and `PaymentCheckout` only for the Razorpay provider. The Play path still routes Notes through `PlayBilling` via [usePurchase.ts](mobile-app/src/hooks/usePurchase.ts). The [provider self-test](mobile-app/scripts/payment-provider-selftest.cjs) passes. A wrong-channel Razorpay OTA cannot match the new Play runtime under the current Expo config. A new native build is required for this runtime change; existing binaries on the old `1.2.0` runtime do not gain this boundary retroactively. Actual published updates and final binary routing remain unverified.

The other four HIGH findings require price/catalog decisions, a resolved native dependency graph, a final signed artifact, or hosted state. No local edit can establish those facts.

## D. Resolved MEDIUM Issues

**GP-08 — FIXED AND VERIFIED locally.** The payment answers in [faq.mjs](website/_src/faq.mjs) and [faq.html](website/faq.html) now identify Google Play Billing for Play distribution and Razorpay for separate permitted builds. FAQ JSON-LD matches the visible copy. The website remains informational and has no checkout added. Publication is a separate external step.

**GP-06 — PARTIALLY FIXED.** [playOfferSelection.ts](mobile-app/src/services/playOfferSelection.ts) filters for one INR, quoted-price, non-discounted, non-rental, non-preorder Buy offer, even when other eligible offers exist. Ambiguous standard offers still fail. [playBillingService.ts](mobile-app/src/services/playBillingService.ts) still checks the product's INR price against the server quote before selecting the offer. The [offer self-test](supabase/tests/play-offer-selftest.ts) passed. If the native wrapper reports a discounted aggregate `product.price` while the standard offer has the correct quote, checkout will still reject; removing that validation without device evidence would violate the requested price-match rule.

**GP-07 — PARTIALLY FIXED.** [restorePlayPurchases](mobile-app/src/services/playBillingService.ts) now catches an individual receipt lookup failure and continues to the next unconsumed receipt. The [restore self-test](mobile-app/scripts/play-restore-selftest.cjs) makes the first lookup fail and verifies that the second receipt reaches backend verification. Unknown ownership or missing server orders still do not grant access; those cases need licensed scenario tests and a reviewed support path.

## E. Resolved LOW Issues

**None.** GP-10 concerns price-tier documentation and remains out of the authorized edit scope. The checked-in seed and both pricing documents were left as found; no inference was made about hosted tiers.

## F. Files Modified

Files changed by this pass: [app.config.js](mobile-app/app.config.js), [payment-provider-selftest.cjs](mobile-app/scripts/payment-provider-selftest.cjs), [AppNavigator.tsx](mobile-app/src/navigation/AppNavigator.tsx), [playOfferSelection.ts](mobile-app/src/services/playOfferSelection.ts), [playBillingService.ts](mobile-app/src/services/playBillingService.ts), [play-offer-selftest.ts](supabase/tests/play-offer-selftest.ts), [faq.mjs](website/_src/faq.mjs), [faq.html](website/faq.html), and new [play-restore-selftest.cjs](mobile-app/scripts/play-restore-selftest.cjs) and this report. Several of these files, and many unrelated files, were already modified or untracked before this pass; those pre-existing changes were preserved. No Razorpay checkout, Razorpay verification, Admin Panel, pricing table/seed, or migration was edited by this pass.

## G. Dependency and Billing Library Status

`expo-iap` is installed at **3.4.4**. Its metadata requests **OpenIAP Google 1.3.26** through [build.gradle](mobile-app/node_modules/expo-iap/android/build.gradle) and [openiap-versions.json](mobile-app/node_modules/expo-iap/openiap-versions.json). **The exact resolved `com.android.billingclient` version is UNKNOWN**: there is no generated native project, Gradle resolution result, cached artifact, or final AAB here. OpenIAP's version is not a BillingClient version. No dependency was changed without an exact resolved version and compatibility evidence. Google's [Billing Library deadline table](https://developer.android.com/google/play/billing/deprecation-faq) must be applied to the resolved version before upload; Billing Library 7's ordinary update deadline was 2026-08-31, version 8's is 2027-08-31, and version 9's is 2028-08-31.

## H. Android BILLING Permission Status

[app.json](mobile-app/app.json) registers the `expo-iap` plugin and names `in.medveda.app`. The installed [expo-iap source manifest](mobile-app/node_modules/expo-iap/android/src/main/AndroidManifest.xml) declares `com.android.vending.BILLING`. No duplicate permission was added. There is no generated app merged manifest or AAB in the workspace, so **final AAB permission presence and native module registration are NOT VERIFIED**. [eas.json](mobile-app/eas.json) defines app-bundle profiles for `production` and `internal-testing`, uses remote version codes, and has a separate Razorpay APK profile; actual versionCode, signing, and release merge are unknown.

## I. Play-only Routing Verification

The Play `usePurchase` branch opens `PlayBilling`; the Play navigator no longer registers either Razorpay checkout screen. Production/internal-testing configuration rejects `MEDVEDA_PAYMENT_PROVIDER=razorpay`, and Android runtime versions differ between providers. The provider self-test and Expo public-config checks passed. This establishes local configuration and navigation behavior, not a claim about a signed/uploaded binary or an already-published OTA update. A separate Razorpay distribution remains configured.

## J. Backend Verification Status

Source inspection confirms authenticated `create-play-order` and `verify-play-purchase`, Google purchase lookup, package/product/state/ownership checks, unique-token and atomic settlement SQL, deferred consumption, and refund reversal. Pending purchases are not granted an entitlement. `deno check`, worker mock tests, and disposable PostgreSQL checks passed. These checks do not prove that the same functions, credentials, schema, worker schedule, or alerts exist in hosted Supabase. No verification bypass or entitlement shortcut was introduced. The payment success flow still depends on server order status and does not accept a deep-link parameter as proof of payment.

## K. Purchase Restore and Refund Status

The new per-receipt restore test passed; server order/obfuscated buyer matching remains required. Local worker tests covered consumption retries, void cursor fairness, and refund replay. Disposable PostgreSQL checks passed purchase-token replay prevention, one-payment/one-entitlement settlement, refund reversal and idempotency, and Razorpay entitlement isolation. Reinstall, account switching, pending-to-purchased, already-owned, full/partial refund propagation, and real Play void timing remain **NOT VERIFIED** on licensed devices/hosted staging. RTDN/Pub/Sub is not part of the current polling design; any future adoption requires separate infrastructure review.

## L. Razorpay Regression Results

No Razorpay source, checkout, credentials, verification, or pricing code was changed. The separate `razorpay-distribution` Expo configuration resolves `1.2.0-razorpay`; its checkout screens remain registered when that provider is selected. The provider, purchase/entitlement, and PostgreSQL isolation tests passed locally. A real Razorpay distribution build and checkout were not exercised.

## M. Automated Test Results

All commands below were run during this pass and exited successfully unless explicitly described as evidence inspection:

| Check | Result |
|---|---|
| `node mobile-app/scripts/payment-provider-selftest.cjs` | PASS: package/provider guards and distinct runtime versions. |
| `node mobile-app/scripts/play-restore-selftest.cjs` | PASS: second receipt verifies after first lookup fails. |
| `deno run --allow-read supabase/tests/play-offer-selftest.ts` | PASS: standard Buy selection and unsafe/ambiguous offer rejection. |
| `mobile-app/node_modules/.bin/tsc --noEmit -p mobile-app/tsconfig.json` | PASS. |
| `deno check` on `create-play-order`, `verify-play-purchase`, `play-payment-worker` | PASS. |
| `node supabase/tests/play-payment-worker-selftest.cjs` | PASS; expected mocked failure paths logged. |
| `node supabase/tests/play-consumption-selftest.cjs` | PASS; expected mocked outage logged. |
| `node supabase/tests/play-reconcile-fairness-selftest.cjs` | PASS; expected mocked Google errors logged. |
| `node mobile-app/scripts/purchases-selftest.cjs` and `staging-build-selftest.cjs` | PASS. |
| Expo `config --type public --json`, sanitized output for Play and Razorpay | PASS: `in.medveda.app`, `1.2.0-play`, `1.2.0-razorpay`, provider and plugin values. |
| FAQ JSON-LD parse and Play Billing wording check | PASS. |
| Disposable local PostgreSQL 17: `play_payment_pg_checks.sql`, `play_entitlement_snapshot_checks.sql`, `ucb_checks.sql` | PASS: Play queue/token/cursor/RPC checks, immutable entitlement snapshot, Razorpay insert isolation, **0 FAIL / 28 PASS** UCB checks. Only the curated migration set and local seed were applied; no hosted database was touched. |
| `git diff --check` | PASS. |

These tests are local mocks and SQL checks. They do not substitute for BillingClient resolution, AAB inspection, hosted staging, or licensed device testing.

## N. External Configuration Blockers

1. **GP-01:** Owner inventory of hosted product prices, active `play_price_tiers`, and actual Play Console one-time products/options/India prices. The current checked-in tier seed is empty. Admin Panel price changes do not automatically update Console prices. No SKU or price should be created or changed from this report.
2. **GP-02/03:** Approved native build/dependency-resolution access and final signed AAB for exact BillingClient version, merged BILLING permission, package, versionCode, signature, and plugin linkage.
3. **GP-04/09:** Read-only hosted migration/function/secret/cron/alert inventory, then a separately reviewed isolated staging rollout. The existing [PostgreSQL QA report](docs/PLAY_PAYMENT_POSTGRES_QA_2026-10-15.md) warns that a blanket migration push can include flagged 2026-10-14 files.
4. **GP-05/06/07:** Real update-channel check and licensed Play device scenarios for standard Buy, cancel, pending, restart, reinstall, already-owned, restore, consume, and refund.
5. **GP-10:** Owner-approved reconciliation of pricing documentation against the actual hosted state; pricing changes were excluded here.

## O. AAB Readiness

**Not verified and not yet cleared for release.** Source package/plugin/permission/EAS profile checks passed. An authorized build must resolve the native BillingClient graph and produce an AAB before its manifest, package, versionCode, signing, and Play-only behavior can be checked. Changing Android runtime from the prior app-version policy to `1.2.0-play` / `1.2.0-razorpay` also requires a new native build; existing `1.2.0` runtime binaries will not accept updates targeted to these new runtimes. No build or upload was run.

## P. Production Release Recommendation

**NO-GO.** The local non-pricing fixes are testable and the local tests passed, but GP-01 through GP-04 and GP-09 remain external blockers; GP-05 through GP-07 need real artifact/device validation. Production release should wait for a reviewed catalog match, supported resolved BillingClient, inspected signed AAB, hosted verification/worker readiness, and licensed purchase/refund evidence. Preserve the distinct Play and Razorpay release channels.

## Q. Exact Next Developer Action

Collect a **read-only release inventory** for `in.medveda.app`: hosted Notes prices and active `play_price_tiers`, Play Console product IDs/Buy options/India prices, uploaded artifact/versionCode, remote EAS versionCode, and hosted Supabase migration/function/cron state. Compare each server quote to its configured Play product without editing either. Then resolve `releaseRuntimeClasspath` in an authorized native build environment and inspect the resulting AAB. Only after those facts are reviewed should an isolated staging rollout and licensed purchase matrix be scheduled.

**Count summary:** HIGH **1 locally implemented, 4 still blocked; 0 externally verified**. MEDIUM **1 fixed and verified locally, 2 partially fixed, 1 blocked**. LOW **0 fixed, 1 unresolved**. BillingClient **UNKNOWN**; source BILLING permission **present**, AAB permission **unknown**; AAB **absent**; hosted Supabase **unverified**; Play-only source routing **verified locally**, binary/OTA behavior **unverified**; Razorpay source **preserved**.
