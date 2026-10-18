# MedVeda payment implementation result

**Date:** 2026-10-15 UTC. **Release decision: NO-GO.** This is a local source and mocked-test result, not a hosted payment or signed-AAB verification. No hosted database, Edge Function, cron, EAS build, Play Console product, cloud resource, or real transaction was changed. Pre-existing working-tree edits were preserved.

## A. Executive summary

The Android package remains `in.medveda.app`. Play purchase preparation now returns the server order amount, compares it with the current quote and Google product, and selects exactly one standard full-price BUY option. A new additive SQL guard makes a delayed Play purchase use the order's entitlement snapshot even if the catalog changes. An unverified route parameter can no longer display a successful payment: the success screen checks the signed-in user's paid order and successful purchase row. Obsolete public Play links and misleading provider copy were corrected. The temporary ₹1 tier was removed from the release seed. Existing Play verification/consumption/refund worker and Razorpay settlement remain in place.

**CODE COMPLETE:** no; local changes are implemented, while production product inventory and optional RTDN are not configured. **LOCAL TESTS PASSED:** listed in J. **BUILD VERIFIED:** no; only a generated source manifest was inspected. **PLAY CONSOLE CONFIGURATION PENDING:** yes. **LIVE PAYMENT TESTING PENDING:** yes. **PRODUCTION READY:** no.

## B. Original audit issues and issue-by-issue resolution

| Issue / original severity | Resolution status | Files changed | Evidence and test result | Remaining dependency |
|---|---|---|---|---|
| GP-01 HIGH | BLOCKED - USER ACTION REQUIRED | None to native billing configuration | `mobile-app/app.json:14,48` selects `in.medveda.app` and `expo-iap`; scratch prebuild generated BILLING and `openiap-google:1.3.26`. No merged release manifest/AAB; Gradle resolution stopped before dependencies. `payment-provider-selftest.cjs` passed. | Resolve Gradle, verify Billing Library 8+ and signed internal AAB with bundletool, then owner uploads it to the registered Play app. |
| GP-02 HIGH | BLOCKED - USER ACTION REQUIRED | `supabase/functions/create-play-order/index.ts:14-27`; `mobile-app/src/screens/payment/PlayBillingScreen.tsx:87-108`; `mobile-app/src/services/playBillingService.ts:284-295`; `mobile-app/src/services/playOfferSelection.ts:13-27`; `supabase/seed/play_price_tiers.json:1-4`; `supabase/migrations/20261015120000_play_entitlement_order_snapshot.sql:1-31` | Exact active tier selection already exists in `supabase/migrations/20261012100000_google_play_ucb.sql:130-142`; order amount, single standard offer and immutable entitlement snapshot checks added. New offer and local SQL tests passed. | Actual active Notes prices, approved SKUs, Play products, and live prices are REQUIRED FROM OWNER. No active production tier is in the seed. New migration needs reviewed staging deployment. |
| GP-03 HIGH | BLOCKED - USER ACTION REQUIRED | `supabase/functions/create-play-order/index.ts:14-27`; `supabase/migrations/20261015120000_play_entitlement_order_snapshot.sql:1-31` | Existing authenticated Google lookup and atomic SQL settlement remain at `supabase/functions/verify-play-purchase/index.ts:19-58` and `supabase/migrations/20261012100000_google_play_ucb.sql:206-294`. Worker mock, Deno check, consumption and local SQL tests passed. | Isolated staging migration preflight, service account, API access, Edge deployment, cron, real consumption and refund evidence. Normal migration push remains unsafe because of the flagged 2026-10-14 files. |
| GP-04 MEDIUM | IMPLEMENTED - NEEDS EXTERNAL VERIFICATION | `mobile-app/src/services/playOfferSelection.ts:13-27`; `mobile-app/src/services/playBillingService.ts:253-264,284-295`; `mobile-app/src/screens/payment/PlayBillingScreen.tsx:99-108`; `supabase/tests/play-offer-selftest.ts:1-12` | Local test rejects wrong price/currency, multiple offers, discounts, rent, preorder and missing token; `requestPurchase` passes the selected offer token. | Confirm real Play `ProductDetails` for one standard BUY option on a licensed tester. |
| GP-05 MEDIUM | IMPLEMENTED - NEEDS EXTERNAL VERIFICATION | `mobile-app/src/navigation/AppNavigator.tsx:82-89`; `mobile-app/src/screens/payment/PaymentSuccessScreen.tsx:19-76`; `mobile-app/src/types/navigation.ts:110-117` | Public payment-success link removed; screen checks auth, paid order ownership, successful entitlement and matching amount, and shows a neutral state on failure. TypeScript passed. | Device test cold/warm deep links and legitimate Play/Razorpay navigation. |
| GP-06 MEDIUM | PARTIALLY FIXED | `mobile-app/src/components/SideDrawer.tsx:137`; `mobile-app/src/screens/profile/ProfileScreen.tsx:72`; `mobile-app/src/screens/referral/ReferralScreen.tsx:30`; `mobile-app/src/screens/settings/SettingsScreen.tsx:34,58`; `mobile-app/src/services/appConfigService.ts:13,61-64`; `website/assets/js/config.js:6`; `website/scripts/build.mjs:12`; generated website pages; `mobile-app/app.config.js:5`; `docs/RELEASE_GATES.md:34` | Local link search found no obsolete public Play listing link except the deliberate compatibility check in appConfig. Website build and package self-test passed. iOS `com.medveda.app` and historical migrations were preserved. | Hosted `app_config.store_url` must be read and corrected if stale; published site and installed app still need verification. |
| GP-07 MEDIUM | IMPLEMENTED - NEEDS EXTERNAL VERIFICATION | None; existing worker retained | `supabase/functions/play-payment-worker/index.ts:52-127,169-239`, `supabase/migrations/20261015100000_play_payment_jobs.sql:1-207`, and `supabase/play_payment_cron_setup.sql:1-52` provide retry, lease, void cursor, reversal and polling. Worker/reconcile mocks passed. | Deploy and schedule in staging; prove void/refund timing and backlog. RTDN is not implemented. |
| GP-08 MEDIUM | IMPLEMENTED - NEEDS EXTERNAL VERIFICATION | `mobile-app/src/screens/terms/TermsScreen.tsx:56-64`; `mobile-app/src/screens/privacy/PrivacyScreen.tsx:63-82`; `website/_src/pages/features.html:17`; `website/_src/pages/how-it-works.html:9`; generated website pages | Copy now identifies Google Play Billing in the Play Android app and Razorpay in separately permitted builds. Website build passed. | Review final legal copy and published site against enrolled payment programs and actual handling. |
| GP-09 LOW | PARTIALLY FIXED | Provider wording and listing files above | `mobile-app/app.config.js:23-30`, `mobile-app/eas.json:42-72`, `mobile-app/src/hooks/usePurchase.ts:34-39` and payment-provider self-test preserve Play/Razorpay routing. `website/` has no verified checkout implementation. | Licensed build routing tests; separate website Razorpay checkout remains NOT VERIFIED. |

**Counts:** 0 fully fixed and externally verified; 2 partially fixed; 3 blocked on owner/external setup; 4 implemented and awaiting external verification.

## C. Changes implemented

1. Server-created Play orders are checked for an active Notes scope and return their persisted INR amount (`supabase/functions/create-play-order/index.ts:14-27`). The client compares that amount with the server quote and Google's INR product (`mobile-app/src/screens/payment/PlayBillingScreen.tsx:87-108`; `mobile-app/src/services/playBillingService.ts:284-295`). No client price is accepted by the server.
2. Only one standard full-price BUY offer is accepted and its token is passed to `expo-iap` (`mobile-app/src/services/playOfferSelection.ts:13-27`; `mobile-app/src/services/playBillingService.ts:253-264`). Complex offers fail closed.
3. The success screen no longer trusts supplied title, amount or order ID alone (`mobile-app/src/screens/payment/PaymentSuccessScreen.tsx:19-76`). The public success/failure link mappings were removed (`mobile-app/src/navigation/AppNavigator.tsx:82-89`); password-reset linking stays active.
4. Public Play listing URLs use `in.medveda.app`. The app also refuses the obsolete hosted store URL locally until it is corrected (`mobile-app/src/services/appConfigService.ts:61-64`). Website pages were regenerated from reviewed source.
5. The temporary ₹1 test tier was removed from the release seed (`supabase/seed/play_price_tiers.json:1-4`); no production prices were invented.
6. A Play-only purchase insert guard uses the immutable order snapshot for chapter, subject, year, bundle and course IDs (`supabase/migrations/20261015120000_play_entitlement_order_snapshot.sql:7-30`). Existing rows and Razorpay inserts are unaffected.

## D. Files modified

Payment source: `supabase/functions/create-play-order/index.ts`, `mobile-app/src/services/playBillingService.ts`, `mobile-app/src/services/playOfferSelection.ts`, `mobile-app/src/screens/payment/PlayBillingScreen.tsx`, `mobile-app/src/screens/payment/PaymentSuccessScreen.tsx`, `mobile-app/src/navigation/AppNavigator.tsx`, `mobile-app/src/types/navigation.ts`, `supabase/seed/play_price_tiers.json`, `supabase/migrations/20261015120000_play_entitlement_order_snapshot.sql`, `supabase/tests/play-offer-selftest.ts`, `supabase/tests/play_entitlement_snapshot_checks.sql`, `supabase/tests/play_payment_pg_checks.sql`.

Links and disclosure: `mobile-app/app.config.js`, `mobile-app/src/components/SideDrawer.tsx`, `mobile-app/src/screens/profile/ProfileScreen.tsx`, `mobile-app/src/screens/referral/ReferralScreen.tsx`, `mobile-app/src/screens/settings/SettingsScreen.tsx`, `mobile-app/src/services/appConfigService.ts`, `mobile-app/src/screens/terms/TermsScreen.tsx`, `mobile-app/src/screens/privacy/PrivacyScreen.tsx`, `website/assets/js/config.js`, `website/scripts/build.mjs`, `website/_src/pages/features.html`, `website/_src/pages/how-it-works.html`, regenerated `website/*.html`, and `docs/RELEASE_GATES.md`. This report is new. Unrelated pre-existing files and the flagged 2026-10-14 migrations were not edited.

## E. Security improvements

Play settlement still requires an authenticated order, matching SKU, token, account/profile hash, purchased state and India region (`supabase/functions/verify-play-purchase/index.ts:19-47`). PENDING cannot unlock. Unique token indexes and row-locked settlement protect replay (`supabase/migrations/20261012100000_google_play_ucb.sql:78,93,214-253`). New UI checks prevent stale/wrong Play price or complex offer selection, and success presentation now requires a server purchase row. Access remains controlled server-side by successful entitlements and note URL authorization, not by this screen.

The existing Play settlement reads product scope fields from the current `products` row (`google_play_ucb.sql:237-251`), but the new insert guard replaces entitlement identity fields from the order snapshot before persistence. A disposable PostgreSQL test changed a product after order creation and confirmed the original chapter unlocked; it also confirmed Razorpay inserts were unaffected. The server cannot independently prove a Play Console SKU price from the legacy `purchases.products.get` response, so Console price reconciliation remains a release gate.

## F. Android billing status

| Field | Result |
|---|---|
| Application ID | `in.medveda.app` in Expo config and scratch generated `android/app/build.gradle` |
| Version name | `1.2.0` in `mobile-app/app.json:5` |
| Version code | Unknown; EAS remote version source (`mobile-app/eas.json:2-5`) |
| Build profile | Intended `internal-testing`, AAB and Play provider (`mobile-app/eas.json:54-62`) |
| BILLING permission | Present in `expo-iap` source and scratch **source** manifest; merged release manifest and AAB NOT VERIFIED |
| Native dependency | Scratch prebuild inserted `io.github.hyochan.openiap:openiap-google:1.3.26` |
| Resolved Billing Library version | **UNKNOWN**; Gradle 9.3.1 was uncached and network blocked. Must prove 8+ before upload. [Google's deadline table](https://developer.android.com/google/play/billing/deprecation-faq) lists normal v7 update deadline as 2026-08-31. |
| Signing | EAS remote credentials and final signature NOT VERIFIED |
| Artifact location | None; no AAB generated |

Scratch prebuild used a copy under `/tmp/medveda-native-check`, not the tracked project. Its generated source manifest contains `com.android.vending.BILLING`; this does **not** prove the final merged release manifest. No Android SDK or cached Gradle distribution was available for a local release build. [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) was consulted before mobile edits.

## G. Supabase backend status

The existing Developer API uses exact `in.medveda.app` (`supabase/functions/_shared/googlePlay.ts:29-33,86-95`), authenticates through a service account and uses `purchases.products.get`. Google still documents that endpoint for product checks, while its [one-time purchase lifecycle guide](https://developer.android.com/google/play/billing/lifecycle/one-time) recommends `purchases.productsv2.getproductpurchasev2` for current purchase state. Migration to V2 requires tested response mapping; the working legacy integration was not blindly replaced. Consumption follows durable SQL settlement; retry and refund/void polling exist locally. Google says consumption acts as acknowledgement and is due within three days after PENDING becomes PURCHASED.

**Deployment-ready:** NO. The Edge source type-checks and mocks pass, but hosted migrations, service-account API access, cron, receipt verification and timing are unverified. `docs/PLAY_PAYMENT_POSTGRES_QA_2026-10-15.md` documents isolated SQL QA only. Its warning against a blanket migration push remains in force.

## H. Product SKU and price mapping

The design is **reusable price tiers**, not one Play SKU per chapter/subject/year/bundle. `create_play_order` maps an active product's server price to one active `play_price_tiers` row; the order snapshots product, scope and price (`google_play_ucb.sql:123-142`). The release seed has zero tiers. Repository test fixtures are synthetic and do not establish production pricing. Product IDs, names, descriptions and INR prices below are intentionally unfilled.

| Product ID | Product name | Product description | Purchase type | India price | Mapped internal price tier | Entitlement category | Status | Required manual action |
|---|---|---|---|---|---|---|---|---|
| REQUIRED FROM OWNER | REQUIRED FROM OWNER | Permanent Notes access for the selected chapter | One-time standard BUY, consumable tier | REQUIRED FROM OWNER | Exact active server price | Chapter Notes | BLOCKED | Inventory active chapter prices; create matching tier SKU in Play |
| REQUIRED FROM OWNER | REQUIRED FROM OWNER | Permanent Notes access for the selected subject | One-time standard BUY, consumable tier | REQUIRED FROM OWNER | Exact active server price | Subject Notes | BLOCKED | Inventory active subject prices; reuse SKU only at same price |
| REQUIRED FROM OWNER | REQUIRED FROM OWNER | Permanent Notes access for the selected year | One-time standard BUY, consumable tier | REQUIRED FROM OWNER | Exact active server price | Year Notes | BLOCKED | Inventory active year prices; verify listing description |
| REQUIRED FROM OWNER | REQUIRED FROM OWNER | Permanent Notes access for the selected bundle | One-time standard BUY, consumable tier | REQUIRED FROM OWNER | Exact active server price | Notes bundle | BLOCKED | Inventory active bundle prices; verify listing description |

A single `notes_<whole INR>` SKU can appear in multiple rows at the same confirmed price; Play product text must describe the selected Notes access generally. Existing SQL and seed validator support whole-INR `notes_<amount>` tiers. Do not activate the removed `notes_1` temporary test tier in production. In isolated staging, run a read-only catalog inventory such as `select scope,price,count(*) from public.products where active and scope in ('chapter','subject','year','bundle') group by scope,price order by scope,price;`, compare each distinct price with Play's India base BUY price, then populate `supabase/seed/play_price_tiers.json`. `node supabase/seed/apply-play-price-tiers.mjs` validates a dry run; `--apply` writes a database and requires separate approval. Activate a tier only after its Console product and backend price match. Fractional INR prices require a reviewed SKU/schema extension before activation.

## I. Razorpay regression status

The Play build profile selects Play; the separate Razorpay distribution selects Razorpay (`mobile-app/eas.json:42-72`). The provider self-test passed. Play, purchases and worker mocks passed, including Razorpay isolation. Existing Razorpay settlement, successful purchase rows and cross-platform entitlement reads were not changed. Live Razorpay checkout and website Razorpay checkout were not exercised; the latter remains NOT VERIFIED in this repository.

## J. Automated test results

| Check | Actual result |
|---|---|
| `node mobile-app/scripts/payment-provider-selftest.cjs` | PASS |
| `node mobile-app/scripts/purchases-selftest.cjs` | PASS |
| `node supabase/tests/play-consumption-selftest.cjs` | PASS (expected mock consume outage recorded for retry) |
| `node supabase/tests/play-payment-worker-selftest.cjs` | PASS, including retry, void reversal, leases, concurrent callback and Razorpay isolation |
| `node supabase/tests/play-reconcile-fairness-selftest.cjs` | PASS |
| `deno run --allow-read supabase/tests/play-offer-selftest.ts` | PASS |
| `deno check` of create, verify and worker Edge Functions | PASS |
| `mobile-app/node_modules/.bin/tsc --noEmit -p mobile-app/tsconfig.json` | PASS (run from `mobile-app`) |
| `node mobile-app/scripts/staging-build-selftest.cjs` | PASS |
| Expo public config | PASS: `in.medveda.app`, version `1.2.0`, `expo-iap` plugin |
| Scratch `expo prebuild --platform android --no-install` | PASS: source BILLING manifest generated |
| Gradle release dependency graph | BLOCKED: wrapper distribution uncached; sandbox network denied |
| `git diff --check` and website build | PASS |
| Disposable PostgreSQL 17: curated baseline + `20261015100000` + `20261015120000`; `play_entitlement_snapshot_checks.sql` | PASS: catalog mutation still grants original chapter; Razorpay insert untouched |
| Disposable PostgreSQL 17: `play_payment_pg_checks.sql`, `ucb_checks.sql` | PASS: Play queue/refund/Razorpay isolation; UCB 0 FAIL, 28 PASS |
| Hosted SQL, AAB inspection, Play tester, refund live test | NOT RUN |

The earlier PostgreSQL QA result in `docs/PLAY_PAYMENT_POSTGRES_QA_2026-10-15.md` remains historical evidence. The new local SQL checks used a separate `/tmp` cluster, excluded both flagged 2026-10-14 migrations, and rolled back all fixtures. Do not run `supabase/tests/run-all.sh` against the normal migration directory while the flagged migrations remain pending.

## K. Android AAB verification

No AAB was generated or uploaded. Once an isolated staging EAS environment and signing access are ready, build `internal-testing` for `in.medveda.app`. Download the exact artifact and record path, SHA-256, versionCode, versionName and signing certificate. Run `java -jar bundletool.jar dump manifest --bundle=<artifact.aab> --module=base` and confirm `package="in.medveda.app"`, `com.android.vending.BILLING`, and Billing Library metadata. Resolve the release dependency graph with `./gradlew :app:dependencyInsight --configuration releaseRuntimeClasspath --dependency com.android.billingclient` in the matching generated project. Confirm the resolved major is supported under Google's current deadline table and that Play Console's uploaded artifact is this same AAB. Source manifest evidence alone does not pass this gate.

## L. Play Console manual actions

1. In the already registered `in.medveda.app` app, verify the internal-track artifact package/version and inspect its permissions. Build the billing-enabled internal AAB in isolated staging, complete the artifact checks in K, and only then upload it with explicit approval; no automatic submit is authorized.
2. Inventory actual active Notes prices and create each distinct approved `notes_<whole INR>` one-time product with one standard BUY purchase option and matching India price. Keep preorder, rent, discounts and other offers off. Record ID, name, description, status and exact tier mapping before activating the backend tier.
3. Give the selected Google service account Android Publisher API access and the required app purchase/order permissions, using least privilege. Confirm test account license eligibility and Play opt-in install.
4. Use a licensed tester to record **PASS/FAIL**, with order/token references held privately, for: successful purchase; cancel; declined payment; pending; pending-to-success; restore after reinstall; account switch; repeat purchase; backend downtime and recovery; refund/void; entitlement revocation. **All currently NOT RUN.** Check consumption within Google's acknowledgement window and `play_recovery_metrics` backlog.
5. RTDN via authenticated Pub/Sub push may reduce refund latency, but no receiver or cloud topic is implemented here. Preserve polling as the required fallback; do not enable RTDN until a secure receiver, deduplication and Google API recheck have been built and tested.

## M. Supabase deployment actions

Use an isolated staging project. Read migration history and schema before applying anything. Follow the curated-release-directory procedure in `docs/PLAY_PAYMENT_POSTGRES_QA_2026-10-15.md:9-28`, extended to include the reviewed `20261015120000_play_entitlement_order_snapshot.sql` after `20261015100000_play_payment_jobs.sql`; exclude the flagged `20261014100000_payment_audit_capture_inbox.sql` and `20261014110000_payment_job_leases.sql`. Do not run a blanket `db push`, reset, repair or production migration. After explicit approval, dry-run the curated push and compare its list with expectations before applying to staging.

Deploy reviewed `create-play-order`, `verify-play-purchase` and `play-payment-worker` with their shared modules; configure `GOOGLE_PLAY_PACKAGE_NAME=in.medveda.app`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `PLAY_PAYMENT_CRON_SECRET` and the isolated project URL without placing secrets in files or logs. Use the staging EAS preview environment. Check service-account API calls, settlement, consumption and reversal before scheduling `supabase/play_payment_cron_setup.sql`; then verify cron runs, metrics and alerts. Read `app_config.store_url` and, with approval for hosted modification, update a stale listing URL to `https://play.google.com/store/apps/details?id=in.medveda.app`. Do not alter historical payments or entitlements.

## N. Remaining blockers

- No signed internal AAB, merged release manifest, resolved Billing Library version, versionCode or Play Console upload verification.
- No confirmed production price inventory, active tier mapping or Play product inventory. Server responses cannot substitute for owner-approved prices.
- Hosted staging and production migrations/functions/secrets/cron are unverified; flagged 2026-10-14 migrations make normal pending-migration commands unsafe.
- No licensed Play transaction, real consumption, refund, void, account switch or restore result. No live Razorpay checkout verification.
- The new entitlement snapshot guard has passed local SQL checks but is not deployed or tested against hosted Supabase; its staging migration is a required gate.
- Website Razorpay checkout functionality remains NOT VERIFIED. RTDN is not implemented; reliable polling requires live validation.

## O. Final release recommendation

**NO-GO** for production or live payment claims. Next developer action: supply the owner-approved active Notes price inventory and corresponding Play Console product details, and prepare an isolated staging EAS/Supabase environment. Then resolve Billing Library version, build and inspect the internal AAB, deploy only reviewed staging components with approval, and complete the licensed-tester matrix. Reassess this report with actual artifacts and PASS/FAIL evidence before any production rollout.
