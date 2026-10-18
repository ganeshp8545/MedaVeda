# MedVeda AAB final verification

**Audit date:** 2026-10-16 UTC. **Decision: INSUFFICIENT EVIDENCE to clear Internal Testing upload.** This is a read-only audit of the existing AAB. The bundle was downloaded to `/tmp/medveda-c9cdda93.aab`; no app source, configuration, credentials, hosted service, payment, build, or Play Console state was changed. Only this report was added to the project. `bundletool` was unavailable, so the compiled manifest was decoded from the AAB's protobuf with a temporary read-only parser; ZIP, DEX, resources, embedded config, and JAR signature were checked with installed tools. This establishes substantial artifact evidence but does not simulate Play ingestion.

Status vocabulary: **PASS**, **FAIL**, **PARTIAL**, **NOT VERIFIED**, **NOT APPLICABLE**. An EAS or source claim is distinguished from a check of the actual bundle throughout.

## A. Executive summary

The **new** production AAB was located and inspected. Its base manifest has the correct package, version `1.2.0` / code `2`, target API `36`, `com.android.vending.BILLING`, and BillingClient metadata `8.3.0`. DEX contains Expo IAP, OpenIAP, BillingClient, ProductDetails, and purchase-listener descriptors. Its embedded Expo config selects `play` and runtime `1.2.0-play`. The bundle passes ZIP and ordinary JAR signature verification.

The bundle also embeds the **production Supabase URL**, by design of the production EAS profile. Upload certificate matching, Play Console package/version history, product setup, hosted purchase verification, and licensed device behavior remain unverified. This AAB is **not cleared for licensed payment tests** against an isolated environment and is **not production ready**. A successful upload would not make the production backend safe for payment experiments.

## B. Exact artifact identity

| Check | Status | Evidence |
|---|---|---|
| Latest successful Android AAB | PASS | Read-only `eas build:list --platform android --limit 10 --json` on 2026-10-16 identified build `c9cdda93-0bcc-438c-a224-c8b61a4ac2d2` as the newest Android build, `FINISHED`, profile `production`, distribution `STORE`; created `2026-10-15T20:02:39.868Z`, completed `2026-10-15T20:22:13.018Z`. |
| Build source and channel | PARTIAL | EAS reports Git commit `75c29c2a4fb3d74bc793a88c19482c629a7e5b6d`, channel `production`, runtime `1.2.0-play`. The local working tree differs from that commit; the SHA alone cannot prove whether uncommitted files were included in the EAS upload. Artifact metadata takes precedence over current source. |
| Exact artifact | PASS | EAS artifact: `https://expo.dev/artifacts/eas/9JxfUKlRWy8DJ4C9l3YCv28Tlfpx6_FV-v3hAnnO9Sc.aab`; downloaded unchanged to `/tmp/medveda-c9cdda93.aab`. This is **not** the older `1.1.0` AAB, whose EAS build ID is `4e2f4d16-f95f-4598-90bf-c725b1488ebc` and package is `com.ayurpulse.app`. |

## C. SHA-256 and AAB integrity

| Check | Status | Artifact evidence |
|---|---|---|
| File/readability and ZIP CRC | PASS | `/tmp/medveda-c9cdda93.aab`, **91,062,302 bytes**; `unzip -t` reported no compressed-data errors. |
| SHA-256 | PASS | `115a61b957d0149f1a04c6f3fc59342e4e52a6738e6cbcd08e9abf7bd26020ab` (`sha256sum`). This is the downloaded file's digest; EAS did not provide an independent published digest to compare. |
| AAB structure | PASS | `BundleConfig.pb` is parseable (bundletool build version metadata `1.18.1`); sole app module is `base`, with `base/manifest/AndroidManifest.xml`, `base/resources.pb`, `base/res/`, `base/assets/index.android.bundle`, and five `base/dex/classes*.dex` files with DEX magic. |
| Full bundletool validation / Play processing | NOT VERIFIED | `bundletool` was not installed. Play Console has not processed this exact file in this audit. |

## D. Package and version

| Check | Status | Compiled manifest / EAS evidence |
|---|---|---|
| Application ID | PASS | `base/manifest/AndroidManifest.xml`: `in.medveda.app`; agrees with EAS `appIdentifier` and embedded `base/assets/app.config`. |
| Version | PASS | Compiled manifest and EAS: `versionName=1.2.0`, `versionCode=2`. EAS remote versioning means local `app.json` alone would not establish code `2`. |
| Android SDK levels | PASS | Compiled manifest: `minSdkVersion=24`, `targetSdkVersion=36`, `compileSdkVersion=36`. API 36 meets Google's [August 2026 target API requirement](https://support.google.com/googleplay/android-developer/answer/11926878). |
| Version-code eligibility | NOT VERIFIED | No trusted Play Console artifact inventory or highest version code was available. Code `2` must exceed every prior upload for **this package**. Older builds of another package cannot establish that. |

## E. BILLING permission

**PASS:** `base/manifest/AndroidManifest.xml` in this exact AAB contains one `uses-permission android:name="com.android.vending.BILLING"`. It is in the base module; the final manifest has no removal of it and no conflicting billing permission. The compiled application also declares `com.google.android.play.billingclient.version=8.3.0`, and Billing proxy activities are present. This confirms the release artifact itself carries the permission; `mobile-app/app.json` and the `expo-iap` library manifest are supporting context only. [Google's Billing setup guide](https://developer.android.com/google/play/billing/getting-ready) requires a billing-enabled artifact for Console product features.

## F. Actual BillingClient version

**PASS:** Compiled base manifest application metadata reports **`com.google.android.play.billingclient.version=8.3.0`**. BillingClient classes are present in `base/dex/classes2.dex` and `classes3.dex`. This is artifact-level resolved-library evidence, stronger than the source declaration. `expo-iap` **3.4.4** (`mobile-app/package.json`), OpenIAP Google **1.3.26** (`mobile-app/node_modules/expo-iap/openiap-versions.json`), and BillingClient **8.3.0** are three different versions. `expo-iap/android/build.gradle` depends on OpenIAP Google, which supplies the Billing dependency transitively. A Gradle resolution report from this exact EAS build was not retained here, so the exact graph is **NOT VERIFIED**, while the compiled BillingClient version metadata is verified. Google's [Billing Library deadline table](https://developer.android.com/google/play/billing/deprecation-faq) gives version 8 an ordinary new-app/update deadline of **2027-08-31**; as of this audit, 8.3.0 is within that window.

## G. Native Billing integration

| Check | Status | Evidence and limit |
|---|---|---|
| Native linkage | PASS | `base/dex/classes3.dex` contains `Lexpo/modules/iap/ExpoIapModule;` and OpenIAP descriptors; DEX also contains BillingClient, ProductDetails, and PurchasesUpdatedListener descriptors. The compiled manifest includes `ProxyBillingActivity` and `ProxyBillingActivityV2`, both non-exported. |
| Buy / query / listener / restore / consume implementation | PARTIAL | Current source in `mobile-app/src/services/playBillingService.ts:215-335` calls `initConnection`, `fetchProducts`, `requestPurchase` with one-time `in-app` type and offer token, installs purchase listeners, and calls `getAvailablePurchases`. `mobile-app/App.tsx:54-67` invokes restore. `supabase/functions/verify-play-purchase/index.ts:22-65` checks Google purchase state and consumes after settlement. The DEX proves native classes exist, but the current uncommitted source cannot by itself prove every JS branch in the already-built artifact. |
| Runtime purchase sheet and completion | NOT VERIFIED | No Play-installed device, licensed tester, product query, purchase, pending transition, restore, or refund was exercised. Class presence is not runtime success. |

## H. Play-only routing

**PARTIAL:** `base/assets/app.config` embeds `extra.medvedaPaymentProvider="play"`, Android runtime `1.2.0-play`, and the `production` EAS channel. `mobile-app/eas.json:42-55` sets `MEDVEDA_PAYMENT_PROVIDER=play` for this profile. Current source routes Buy to Play (`mobile-app/src/hooks/usePurchase.ts:34-39`), conditionally registers `OrderSummary` and `PaymentCheckout` only for Razorpay (`mobile-app/src/navigation/AppNavigator.tsx:155-163`), and guards the Razorpay summary (`mobile-app/src/screens/payment/OrderSummaryScreen.tsx:86-105`). The manifest exposes `medveda://` to `MainActivity`; current navigation links only `reset-password` (`AppNavigator.tsx:89-99`).

The compiled JS bundle **does contain Razorpay, PaymentCheckout, and OrderSummary strings**. This is expected with static imports and proves they are **not absent from the binary**. The compiled routing branch was not behaviorally exercised, and a future OTA can alter JS. Direct navigation to Razorpay checkout in this Play build is **not demonstrated**, but cannot be categorically excluded from artifact metadata alone. The separate Razorpay distribution source remains untouched.

## I. OTA isolation

**PARTIAL:** The manifest's Expo Updates request header is `{"expo-channel-name":"production"}`; EAS identifies runtime `1.2.0-play`. Read-only EAS channel inspection on 2026-10-16 found `production` mapped only to the `production` branch, with no update groups shown; `preview` and `shrink-test` are separate. Current `mobile-app/app.config.js:19-37` assigns a different `1.2.0-razorpay` runtime to Razorpay. A correctly published Razorpay update with that runtime is incompatible with this AAB. EAS showed no Razorpay channel, and no future publishing behavior can be proved. This AAB's embedded config does not show Expo OTA code-signing metadata; a bad update intentionally published to the production channel with the Play runtime remains a release-process risk. Native compatibility for future updates is **NOT VERIFIED**.

## J. Security findings

| Check | Status | Compiled evidence / scope |
|---|---|---|
| Release flags and transport | PASS | Application manifest has `allowBackup=false`, `usesCleartextTraffic=false`; no `debuggable=true` or `networkSecurityConfig` override. Secure Store backup/data-extraction rule resources are present. No cleartext exception was observed. |
| Exported components | PARTIAL | `MainActivity` is exported for launcher and `medveda://` VIEW links. `FirebaseInstanceIdReceiver` is exported with `com.google.android.c2dm.permission.SEND`; `ProfileInstallReceiver` is exported with `android.permission.DUMP`. Other inspected activities, services, receivers and providers are non-exported. Source-based routing indicates only password reset links; external-input runtime handling was not fuzzed. |
| Permissions | PARTIAL | Base manifest has 30 `uses-permission` elements. Platform permissions include Internet, notifications, vibration, network/Wi-Fi state, wake lock, boot completion, screen-capture detection (API 34+), biometrics/fingerprint, and app badge. It also has vendor badge permissions. No location, camera, microphone, contacts, SMS, or external-storage permission was found. Review badge permissions against Data Safety/device behavior; static inspection cannot establish runtime use. |
| Embedded configuration and secrets | PARTIAL | Production Supabase URL is embedded in `base/assets/index.android.bundle`, consistent with `mobile-app/eas.json:42-55`; the Expo public config has a publishable client key. A bounded scan of `app.config` and the JS bundle found no PEM private-key or service-account markers. This is not a comprehensive secret scan of all resources/DEX and says nothing about hosted secret protection. |
| Payment navigation bypass | NOT VERIFIED | Manifest accepts `medveda://` links; current navigation does not register Razorpay checkout when provider is `play`. Dynamic route and OTA behavior require device testing. No confirmed entitlement bypass follows from the manifest. |

**Confirmed security issue:** none established by this static audit. The production backend exposure is an **environment/testing risk**, not evidence that a secret was embedded or an entitlement bypass exists.

## K. Signing and certificate

**PARTIAL:** `jarsigner -verify` exits `0` and says `jar verified`; `META-INF` signing files exist. The signer certificate's SHA-256 fingerprint is **`8C:95:98:E4:EA:07:22:BC:D6:F2:69:0B:10:60:B0:01:D9:FF:F6:19:F7:C1:8B:4B:3B:B5:B0:92:A4:CB:F3:00`**; certificate validity shown by `keytool -printcert -jarfile` is 2026-10-15 through 2054-03-02. `jarsigner -verify -strict` exits `4` because the certificate is self-signed/untrusted to the local JDK and has no timestamp; it also reports JarFile/JarInputStream inconsistency warnings. Ordinary integrity verification succeeded, but these warnings deserve bundletool/Console processing validation. **Play App Signing upload-certificate match: NOT VERIFIED**; no trusted Play Console certificate metadata was available. No private key was opened.

## L. Play Console upload readiness

| Decision | Status | Reason |
|---|---|---|
| AAB technical readiness | PARTIAL | Structure, manifest, permission, API level, BillingClient, linkage and ordinary signature checks pass; bundletool/Play ingestion and device compatibility are unverified. |
| Play Console upload readiness | NOT VERIFIED | The highest `in.medveda.app` version code, Console package identity, upload certificate fingerprint, and Console acceptance of this exact AAB were unavailable. No upload was attempted. |
| Google Play product setup readiness | NOT VERIFIED | One-time product IDs, active Buy options, INR prices, merchant setup and availability were not read from Play Console. Local code cannot establish them. |
| Licensed payment test readiness | FAIL | This **production-profile** bundle embeds the production Supabase endpoint. Hosted verification/functions, service-account access, migrations, consumption worker, cron, catalog and entitlement isolation are unverified. `docs/RELEASE_GATES.md` marks these gates pending. Testing payments against production can create real production records/entitlements. |
| Production release readiness | FAIL | No licensed Play purchase, recovery/refund, hosted backend, data-safety, signing-match or Console release evidence. |

## M. Payment testing readiness and backend boundary

The app calls `create-play-order` and `verify-play-purchase` (`mobile-app/src/services/playBillingService.ts:92-105`); the server checks `GOOGLE_PLAY_PACKAGE_NAME` equals `in.medveda.app` (`supabase/functions/_shared/googlePlay.ts:29-33`). Source verifies token ownership and consumes after settlement (`supabase/functions/verify-play-purchase/index.ts:22-65`). The actual AAB includes a production Supabase URL in its JS bundle and the production profile in `mobile-app/eas.json:42-55` supplies production public credentials. **Hosted deployment and Google API behavior: NOT VERIFIED.** No authenticated production payment endpoint was called; no payment, database mutation or deployment was performed. The `internal-testing` profile in current `eas.json:56-63` is a separate staging-intended profile and is **not this AAB**.

## N. Blocking issues and risks

| Severity / status | Evidence and exact location | Reason / potential impact | Minimum recommended correction |
|---|---|---|---|
| **HIGH / FAIL: production-backed payment tests** | AAB `base/assets/index.android.bundle` contains production Supabase URL; `mobile-app/eas.json:42-55` is production; `docs/RELEASE_GATES.md:9-35` has hosted/test gates pending. | Licensed tests can affect production orders/entitlements and cannot establish isolated test safety. | Use an independently reviewed staging-configured internal-testing artifact and hosted staging project for payment scenarios; do not use this AAB as the safe test environment. |
| **HIGH / NOT VERIFIED: Console identity/version/signing** | AAB manifest package `in.medveda.app`, code `2`; signer fingerprint in section K; no Play Console artifact/certificate inventory. | Upload may be rejected for package, reused/lower version code, or upload-key mismatch. | Read the intended Console app's package, highest uploaded version code and upload certificate SHA-256, then compare to this exact artifact before upload. |
| **HIGH / NOT VERIFIED: hosted and catalog setup** | `supabase/functions/verify-play-purchase/index.ts`, `mobile-app/src/services/playBillingService.ts`, and pending `docs/RELEASE_GATES.md` gates; no hosted or Console inventory. | Product query, verification, consumption, or entitlement/reversal may fail even though the AAB compiles. | Read-only inventory of deployed functions, service-account permissions, worker/cron, active tiers and Console Buy options; validate in isolated staging before licensed tests. |
| **MEDIUM / PARTIAL: OTA release control** | AAB production channel and `1.2.0-play` runtime; `mobile-app/app.config.js:19-37`; EAS production channel unprotected and no updates presently listed. | A future incorrectly targeted JS update could change payment routing despite today's runtime separation. | Restrict production-channel publishing, review provider/runtime metadata for every OTA, and verify code-signing policy in a later release. |
| **MEDIUM / PARTIAL: source-to-artifact correspondence** | EAS source SHA `75c29c2…`; current dirty `mobile-app/src/navigation/AppNavigator.tsx` and `playBillingService.ts`; AAB embedded config/DEX only. | Current routing/offer code may not exactly match the uploaded JS snapshot; device behavior is not established. | Verify the build's source archive or decompile/inspect the exact embedded JS and run Play-installed navigation tests. |
| **LOW / PARTIAL: signature-tool warnings** | `/tmp/medveda-c9cdda93.aab`, `jarsigner -verify -strict` exit `4`; ordinary verification exit `0`. | Self-signed upload certificates are normal, but strict JDK checks cannot prove Console acceptance. | Validate with bundletool/Play Console and compare the upload certificate. Do not rotate credentials on this evidence alone. |

## O. Manual verification required

1. In **the intended Play Console app**, confirm `in.medveda.app`, highest uploaded version code, upload certificate fingerprint, and whether code `2` is accepted for the internal track.
2. Confirm Play one-time products, active Buy options, India prices and licensed tester setup. A product catalog cannot be inferred from the AAB.
3. Confirm EAS source archive/embedded JS routing for this build and the production channel's release controls; test deep links and blocked Razorpay paths on a Play-installed device.
4. Confirm hosted Supabase package setting, deployed verification functions, schema, Google API service-account permissions, consumption/retry worker, refund reconciliation and monitoring **in isolated staging**. Do not infer live success from source.
5. Run licensed buy, cancel, pending, restore, duplicate, consumption and refund scenarios only with an approved staging-backed build; review data safety and device compatibility before production.

## P. Exact recommended next action

**Obtain a read-only Play Console inventory for the intended `in.medveda.app` app: highest uploaded version code, upload-certificate SHA-256, and current artifact status.** Compare those values to code `2` and the fingerprint in section K. Until that comparison, the upload verdict is **INSUFFICIENT EVIDENCE**. Regardless of Console acceptance, use a separately reviewed staging-backed AAB for licensed payment tests; this production-backed AAB is not cleared for that purpose.

## Mandatory final questions

| # | Answer |
|---|---|
| 1. Was the **new** AAB located and inspected? | **PASS — Yes.** EAS build `c9cdda93…`, downloaded to `/tmp/medveda-c9cdda93.aab`. |
| 2. Is it structurally valid? | **PASS** for ZIP, base manifest/resources/DEX structure; full bundletool/Console validation **NOT VERIFIED**. |
| 3. Is the package exactly `in.medveda.app`? | **PASS — Yes**, in compiled manifest. |
| 4. Version name/code? | **PASS — `1.2.0` / `2`**. |
| 5. Final AAB BILLING permission? | **PASS — Yes**, base `uses-permission`. |
| 6. Resolved BillingClient version? | **PASS — 8.3.0**, from compiled manifest metadata. |
| 7. Currently supported? | **PASS — Yes**, under Google's version-8 deadline through 2027-08-31. |
| 8. Expo IAP native integration present? | **PASS — Yes**, native descriptors and Billing classes in DEX. Runtime behavior **NOT VERIFIED**. |
| 9. Play-only payment build? | **PARTIAL — Play is embedded and selected**; compiled JS behavior was not exercised. |
| 10. Can Razorpay checkout accidentally open? | **NOT VERIFIED** at runtime. Current source guards it; Razorpay strings remain in the binary. |
| 11. Play/Razorpay OTA runtimes isolated? | **PARTIAL — `1.2.0-play` vs source `1.2.0-razorpay`**; future publishing controls cannot be proved. |
| 12. Android security acceptable? | **PARTIAL** for inspected manifest; no confirmed critical issue, but dynamic links and full secret/runtime assessment remain. |
| 13. AAB signed? | **PASS — Yes**, ordinary `jarsigner` verification. |
| 14. Certificate matches Play Console? | **NOT VERIFIED**. |
| 15. Ready for Internal Testing upload? | **NOT VERIFIED / not cleared** until Console identity, version and certificate comparison. |
| 16. Safe for licensed payment tests? | **FAIL — No**, it connects to production backend and hosted gates are unverified. |
| 17. Console/hosted verification still needed? | **NOT VERIFIED:** package/version/certificate acceptance, products/prices, tester setup, hosted functions/API permissions/worker and end-to-end outcomes. |
| 18. Single next action? | **Read-only Play Console inventory and comparison** described in section P. |

**Final recommendation: INSUFFICIENT EVIDENCE for upload clearance; payment testing with this production-configured AAB is blocked.**
