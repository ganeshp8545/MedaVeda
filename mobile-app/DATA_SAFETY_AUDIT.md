# MedVeda Google Play Data Safety Audit

Audit date: 2026-10-09. Scope: the shipped Android app source in `mobile-app/`,
the adjacent `supabase/` backend source, and direct dependencies in
`mobile-app/package.json`. This is a technical inventory, not legal advice or
a completed Play Console declaration. “Collected” below means the app sends
data off the device to MedVeda or an SDK/provider, or stores it in MedVeda’s
remote backend. Local-only device storage is called out separately because it
may not be “collected” in Play Console’s definition.

**Release configuration, 2026-10-15:** The Google Play build uses Google Play
Billing only. Razorpay is reachable only from the explicit non-Play staging
profile. The UCB integration described later in this audit is not enabled in
the Play build; do not declare its external transaction token/report or
buyer-selected billing-state paths for that build.

## Release-build data declaration worksheet

“Collected” means sent off-device by the app or stored in MedVeda's backend;
local-only data is shown separately. “Shared” describes the observed recipient,
not a final Play Console classification. **Every Play Console category,
collection, sharing, purpose and optional/required choice is VERIFY** against
the final AAB, service-provider terms and current Console definitions. The
table keeps payment credentials distinct from transaction identifiers. It does
not assert that MedVeda reads card or UPI credentials entered in a provider UI.

| Data type and examples | Collected? | Shared / recipient? | Purpose | Optional? | Play Console classification |
|---|---|---|---|---|---|
| Name | Yes, at registration | Supabase; Razorpay checkout prefill for purchases | Account/profile; payment prefill | Required for registration; purchase optional | VERIFY |
| Email address | Yes, at registration | Supabase, account-email provider; Razorpay prefill for purchases | Sign-in, recovery, account email, referral matching, payment prefill | Required for email account; purchase optional | VERIFY |
| Phone number | Yes, at registration and mobile-account actions | Supabase; no Razorpay send found | Account identity, mobile login/recovery, support | Required for registration in audited flow | VERIFY |
| Education profile: course and academic year | Yes | Supabase | Content selection and course-bound purchase authorization | User chooses; course required before purchase | VERIFY |
| User IDs and obfuscated Play account/order identifiers | Yes | Supabase; obfuscated identifiers to Google Play for billing | Account association, purchase binding and fraud prevention | Required for account/purchase use | VERIFY |
| Referral code, referral relationship and wallet/discount records | Yes when used | Supabase; applicable amounts included in Razorpay order | Referral attribution, eligibility and accounting | Referral use optional | VERIFY |
| Purchase history: products, SKU, scope, amount, status and timestamps | Yes when checkout starts | Supabase; Google Play or Razorpay according to chosen provider | Order creation, entitlement, recovery, support and accounting | Purchase optional | VERIFY |
| Google Play purchase token and Play order ID | Yes for Play Billing purchases | Supabase and Google Play verification API | Verify, consume/reconcile and refund purchases | Play purchase optional | VERIFY |
| Razorpay order/payment IDs and internal order ID | Yes for Razorpay purchases in the non-Play distribution build | Supabase and Razorpay | Verify, reconcile, refund and support payment | Razorpay purchase optional; not reachable in the Play build | VERIFY |
| Alternative billing external transaction token, report ID/status, authorized amount, tax split and refund details | Not in the Play build; legacy UCB integration is inactive | No Play-build external reporting | No Play-build use while alternative billing is unavailable | Not collected by current Play flow | Reassess only if eligibility is confirmed and the feature is re-enabled |
| Buyer-selected Indian billing state or union territory | Not in the current Play or direct Razorpay checkout flow | None in the current app flow | No current app use | Not collected by current build | Reassess if a future approved implementation requires it |
| Card, UPI PIN and bank credentials entered in provider UI | No app-code access or storage found; provider UI collects them | Google Play or Razorpay receives according to choice | Process payment | Purchase optional | VERIFY provider-collected-data treatment |
| Quiz scores, test IDs and subject IDs | Yes after quiz use | Supabase | Results, history and learning progress | Quiz use optional | VERIFY |
| Quiz answers and downloaded quiz content | Local SQLite only in audited path | No upload found for answers/content | Offline quiz use | Optional | VERIFY |
| Search terms | Yes on search | Supabase analytics; recent terms also local | Search analytics and recent searches | Search optional | VERIFY |
| App interactions: opens, screens, chapters, notes, videos, quizzes, orders and unlocks | Yes on use | Supabase analytics | Product analytics, progress and release adoption | Actions optional; logging automatic | VERIFY |
| Bookmarks, reading progress and watch history | Yes when queued sync runs | Supabase | Sync learning state | Feature use optional | VERIFY |
| Push token and device platform | Yes after notification permission | Supabase and Expo Push Service | Send chosen notifications | Permission optional | VERIFY |
| Crash logs, diagnostics, device model and OS version | Conditional on release Sentry DSN | Sentry when enabled | Diagnose errors | Automatic if configured | VERIFY final EAS environment and payload |
| App version/build/platform in app-open analytics | Yes on app use | Supabase | Release adoption and diagnostics | Automatic | VERIFY |
| Notification preferences, read/archive state, recent chapters, streak, local downloads and metadata | Local only in audited path | No app-code upload found | Offline content and personal settings | Optional | VERIFY Console treatment of local-only data |
| Support messages supplied by user | Yes when user emails or messages support | Email/WhatsApp provider and MedVeda | Respond to support requests | Optional | VERIFY channel and provider |

No app-code evidence was found for advertising ID, contacts, camera, photos,
microphone, SMS, call logs, health data or GPS location collection. VERIFY
transitive SDK behavior and the final native manifest before making a Console
declaration.

## Dormant UCB integration — not enabled in the Play release

The details below document the existing integration for a future eligibility
review; they are not collection paths in the current Play build. The Play
build must continue to use Google Play Billing only.

| Data type | New collection / recipient | Why and when | Play Console review |
|---|---|---|---|
| Financial info — purchase history | MedVeda/Supabase stores Play SKU, purchase token, Play order ID, internal order/product, purchase state, amount, and consumption/refund status. Google Play receives server verification calls. Razorpay transactions additionally carry external transaction token, report ID/status, authorized amount, tax split and refund details, which MedVeda reports to Google Play. | Verify and grant a Play purchase; report eligible alternative payments and refunds. Optional purchase flow. | Declare purchase history and check whether transaction identifiers need another category under the current Console form. [Play definitions](https://support.google.com/googleplay/android-developer/answer/10787469). |
| Personal info — user IDs | Google Play receives deterministic obfuscated account and order identifiers through BillingFlowParams; MedVeda verifies them server-side. | Link the Play token to the right account/order and prevent fraud. Optional purchase flow. | Check User IDs collection/sharing and service-provider treatment. Do not put email, phone or raw identifiers in these fields. [BillingFlowParams guidance](https://developer.android.com/reference/com/android/billingclient/api/BillingFlowParams.Builder). |
| Personal info — buyer-selected Indian billing state | Before an eligible Android Razorpay checkout, the buyer selects a required Indian state. MedVeda stores it with the order and sends it as `userTaxAddress.administrativeArea` to Google Play when reporting an authorized external transaction. No device location permission or GPS access is used for this input. | Tax-address field required for India external transaction reporting. Required only to use the Razorpay alternative billing branch. | Include this in the privacy disclosure and review **Personal info → Address**. Also review whether **Location → Approximate location** applies if the answer represents the person's physical location; Play defines these separately. Do not keep the old unconditional “no location” declaration without this review. [Play data types](https://support.google.com/googleplay/android-developer/answer/10787469), [external transaction address](https://developers.google.com/android-publisher/api-ref/rest/v3/externaltransactions). |
| Financial info — tax configuration | The owner states GST is currently 0%; the backend should snapshot `app_config.gst_rate_percent=0`, pre-tax equal to the actual authorized Razorpay amount and tax 0 on each order. Buyer state is still required. | Accurate, retryable external transaction reporting. | Confirm release database/configuration and report payload; never infer the tax split from list price or a later configuration value. [Backend reporting guide](https://developer.android.com/google/play/billing/outside-gpb-backend). |
| Financial info — payment credentials | Google Play Billing and Razorpay each collect credentials in their own UI. The app should not read/store card number, UPI PIN or bank credentials. | Process payment after user choice. | Google's Data safety FAQ says payment-service-collected credentials need not be declared by the app if the app never accesses them and the provider collects directly under its terms. Verify this against the shipped WebView/SDK integration. [Play Data safety FAQ](https://support.google.com/googleplay/android-developer/answer/10787469). |

The UCB build must also update the live app and website privacy/terms/refund
pages. The seller state remains unset until the owner supplies it; it is not a
substitute for the buyer-selected state. UCB enrollment, exact live price-tier
inventory, a successful report with the buyer state and snapshotted 0% tax,
and licensed Play testing remain release gates, as listed in
`docs/UCB_SETUP.md`.

## Executive findings

* The remote application backend is Supabase (Auth, PostgREST/database, Edge
  Functions, and protected content URLs). It receives account, study,
  purchase, referral, push-token, and analytics data described below.
* Razorpay Checkout is live/reachable through `checkout.js` in an in-app
  WebView. It receives Razorpay order data, price and product description, and
  is prefilled with name and email. Payment credentials are entered into the
  Razorpay-controlled UI; this repo does not persist card details, UPI PINs,
  or bank credentials.
* Expo push is reachable when a signed-in user grants notification permission;
  the app sends an Expo push token to Supabase, and the backend sends that
  token plus notification payloads to Expo.
* Sentry code is present but **Sentry is not enabled in the checked-in
  `production` EAS profile**: it does not set `EXPO_PUBLIC_SENTRY_DSN`. A
  separately configured EAS environment variable could change that at build
  time; the repository cannot rule this out.
* At the 2026-10-09 baseline, `IN_APP_PURCHASES_ENABLED` did not occur in the
  mobile source, configuration, or package manifest. The payment flow then was
  Razorpay-only. Re-check the final UCB binary and its native SDK before filing.

## Data-type inventory and evidence

For “required,” required means required to create/use the associated feature;
it does not mean a legal determination of necessity. “Stored” includes local
or remote persistence stated in the evidence.

| Play data type / concrete data | Collected and recipient | Optional or required | Purpose | Ephemeral or stored | Evidence |
|---|---|---|---|---|---|
| Personal info — **Name** | Yes. Sent to Supabase Auth at sign-up and persisted in the Supabase profile; sent to Razorpay Checkout as a payment prefill when buying. Supabase/Razorpay are described in code/UI as service providers; whether either is legally “shared” is a confirmation question. | Required for registration (`fullName`); optional only in the sense that a user who does not register/buy never supplies it. | Account creation; profile; prefill a purchase. | Remote profile; Razorpay checkout receives it for the transaction. | `mobile-app/src/features/auth/authService.ts`: `data: { full_name: params.fullName, mobile_number: params.mobileNumber }`; `mobile-app/src/services/usersService.ts`: `name: data.name`; `mobile-app/src/screens/payment/checkoutHtmlTemplate.ts`: `name: params.prefillName || ""`. |
| Personal info — **Email address** | Yes. Sent to Supabase Auth and stored in profile/Auth; sent to Razorpay Checkout as prefill. A pending referral also stores the sign-up email on-device before account confirmation. | Required for the email registration flow; required to use email login/recovery; purchase prefill is not separately requested. | Authentication, verification/password reset, account profile, purchase prefill, and referral-claim matching. | Remote Auth/profile; local `AsyncStorage` pending referral until applied/cleared; received by Razorpay during checkout. | `authService.ts`: `email: params.email`; `usersService.ts`: `email: data.email`; `utils/pendingReferral.ts`: `const value: PendingReferral = { code, email: email.trim().toLowerCase() }`; `checkoutHtmlTemplate.ts`: `email: params.prefillEmail || ""`. |
| Personal info — **Phone number** | Yes. Sent to Supabase Auth user metadata on registration and to Supabase Edge Functions/RPCs for mobile login, reset, and change. No evidence it is sent to Razorpay from this app. | Required for registration; required if the user chooses mobile-number login/recovery/change. | Account identity, mobile login, password recovery, and contact number management. | Stored remotely in profile/Auth metadata; a session may be stored encrypted locally. | `authService.ts`: `mobile_number: params.mobileNumber`; `authService.ts`: `body: { mobileNumber: identifier.value, password }`; `usersService.ts`: `supabase.rpc("change_my_phone", { p_phone: phone })`. |
| Personal info — **Other personal info / education profile**: course and academic year | Yes, to Supabase profile/RPC. | Required before purchase (`create-order` rejects missing course); course/year selection itself is a user action. | Personalize and authorize course content and prevent cross-course purchases. | Stored remotely in profile; course ID is also stored with local download metadata and recent activity. | `usersService.ts`: `supabase.rpc("set_my_course_year", { p_course_id: courseId, p_year_id: yearId })`; `supabase/functions/create-order/index.ts`: `if (!profile.course_id) return ... "Please select your course before purchasing."`; `config/database.ts`: `course_id TEXT NOT NULL DEFAULT ''`. |
| Identifiers — **User IDs** (Supabase Auth UUID, user IDs in records) | Yes, to Supabase. Attached to analytics, quiz scores, purchases/orders, referrals, push-token records, sync data, and access-control queries. No advertising ID collection was found. | Required after account sign-in for account-bound features. | Account association, authorization, learning records, purchases, referrals, notifications, analytics. | Remote; some queued payloads are local until sync. | `analyticsService.ts`: `user_id: getCurrentUser()?.id ?? null`; `quizAttempts.ts`: `user_id: input.userId`; `pushNotifications.ts`: comment says token is saved “against the signed-in user”; `usersRepository.ts`: `.eq("id", uid)`. |
| Identifiers — **Referral code** | Yes, to Supabase when applied; temporarily local alongside email before verified sign-in. | Optional. | Attribute a referral, eligibility, discount/wallet accounting. | Remote referral/profile records; local pending code/email until applied or cleared. | `referralsService.ts`: `applyReferralCodeRepo(normalizeReferralCode(raw))`; `repositories/referralsRepository.ts`: `supabase.rpc("apply_referral_code", { p_code: code })`; `utils/pendingReferral.ts`: `const STORAGE_KEY = "medveda:pendingReferral"`. |
| Financial info — **Purchase history**: product/title/scope, amount, status, order IDs, Razorpay order/payment IDs, discounts/wallet usage | Yes, stored in Supabase; Razorpay receives the Razorpay order, amount, receipt/order notes and product-related order context. | Optional; only collected when a user starts or completes a purchase. | Create, verify, recover, display, grant, and account for purchases; fraud/abuse controls. | Remote orders/purchases/payment records. On account deletion, orders/payments are retained with `user_id` set to null. | `purchasesService.ts`: `amount: ... data.amount`, `orderId: data.orderId ?? data.razorpayOrderId`; `paymentService.ts`: `body: JSON.stringify({ productId, useWallet })`; `supabase/functions/create-order/index.ts`: `notes: { uid: user.id, productId: product.id, orderId }`; `20260921130000_account_deletion_support.sql`: `update public.payments set user_id = null` and `update public.orders set user_id = null`. |
| Financial info — **Payment credentials** (card/UPI/netbanking/wallet input) | **UNSURE for exact fields, but Razorpay Checkout is reachable and is configured for these methods.** The user enters credentials in Razorpay’s JS checkout; code does not collect or store credential values itself. Razorpay is a payment service provider, but Play Console treatment should be confirmed. | Optional; only after starting a purchase and selecting a method. | Process payment. | Not stored by app code. Exact Razorpay retention/field collection cannot be established from this repository. | `checkoutHtmlTemplate.ts`: `<script src="https://checkout.razorpay.com/v1/checkout.js"></script>` and instruments `{ method: "upi" }`, `{ method: "card" }`, `{ method: "netbanking" }`, `{ method: "wallet" }`; `PrivacyScreen.tsx`: “MedVeda does not store your card numbers, UPI PIN or bank credentials.” |
| App activity — **Quiz scores and study events**: test/subject titles and IDs, score, total, percentage; answers locally; screen/chapter/note/video/quiz events | Yes. Quiz score payloads are queued locally then synced to Supabase `quiz_scores`; analytics events go directly to Supabase `analytics_events`. | Quiz attempt and interaction logging are automatic once the user takes the action; quiz participation/content viewing is optional. | Results/history, offline sync, learning progress, product analytics and app improvement. | Quiz attempts/answers are stored locally in SQLite; score payload syncs remotely. Analytics retention migration targets 12 months, but its comment says scheduling may not be active — **UNSURE whether deletion actually runs in production**. | `quizAttempts.ts`: `answers_json`, `JSON.stringify(input.answers)`, and `queueForSync("quiz_attempt", "upsert", { ... score: input.score, total: input.totalQuestions, percentage })`; `syncEngine.ts`: `? "quiz_scores"`; `analyticsService.ts`: event names include `screen_view`, `chapter_view`, `note_view`, `video_view`, `quiz_attempt`; `20260921120000_analytics_retention.sql`: `delete from public.analytics_events where created_at < now() - interval '12 months'` and `pg_cron is not available ... NOT scheduled`. |
| App activity — **Search history** (search terms) | Yes, two distinct paths: full terms go to Supabase as analytics `search` params; up to 12 recent terms are stored locally in AsyncStorage. | Optional; collected only when the user searches (terms shorter than two characters are not saved locally). | Search analytics; show recent searches. | Remote analytics (nominally 12-month purge); local recent-search history until user clears it/course change/reinstall. | `analyticsService.ts`: `return logEvent({ name: "search", params: { term } })`; `recentSearches.ts`: `const STORAGE_KEY = "medveda:recentSearches"`, `.slice(0, MAX_ENTRIES)`, `await AsyncStorage.setItem(...)`. |
| App activity — **Other user interactions**: app opens, screen views, content views, order-created/purchase-unlocked events; local recent chapters and streak | Yes for the named analytics events to Supabase. Recent chapters and study streak are local-only. | Automatic after optional app/content actions; not an account-registration field. | Usage analytics, content recommendations/“Continue Learning,” streak display, release-adoption tracking. | Remote analytics; local recent chapters (max 10) and streak persist on device. | `analyticsService.ts`: `logAppOpen`, `logScreenView`, `logChapterView`, `logNoteView`, `logVideoView`, `logOrderCreated`, `logPurchaseUnlocked`; `recentActivity.ts`: `const MAX_ENTRIES = 10` and `AsyncStorage.setItem`; `streakTracker.ts`: “Purely device-local” and `AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data))`. |
| App info and performance — **Crash logs / diagnostics** | **Conditional / UNSURE at release time.** Sentry receives scrubbed crash/error events only if a production build is supplied `EXPO_PUBLIC_SENTRY_DSN`. Checked-in `eas.json` production has no such variable, so this repository configuration results in Sentry disabled. | Automatic if enabled and a crash/error occurs; users cannot opt in from visible source. | Diagnose/fix crashes. | Sent to Sentry if enabled; retention is not established by source. | `config/sentry.ts`: `enabled: !__DEV__ && Boolean(dsn)`; `eas.json` production `env` contains only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`; `sentry.ts`: `sendDefaultPii: false`, `delete event.user`, `delete event.request`, `if (event.extra) delete event.extra`. |
| App info and performance — **Device/app details in crashes** (device model, OS, app version) | **UNSURE.** The privacy screen states this is collected for crash/error data, and Sentry SDK may attach runtime context when enabled, but the app source does not enumerate the exact Sentry payload. `Application` explicitly supplies application ID/version/build for Sentry release and analytics app-open. | Conditional as above. | Crash grouping/diagnosis; release adoption. | Conditional remote Sentry event; analytics app version/build stored remotely with app-open event. | `PrivacyScreen.tsx`: “Crash and error data: device model, OS and app version”; `sentry.ts`: `release: Application.applicationId ... nativeApplicationVersion ... nativeBuildVersion`; `analyticsService.ts`: `version`, `build`, `platform`. |
| Device or other IDs — **Expo push token** and platform | Yes, but only after a signed-in user grants notification permission. Token is stored in Supabase and then supplied with notification content to Expo’s push endpoint. | Optional: notification OS permission can be denied; Expo Go/web skip registration. | Deliver remote push notifications and remove token on logout. | Stored remotely in `push_tokens` until unregister/delete-account; deletion migration deletes tokens for account deletion. | `pushNotifications.ts`: `Notifications.requestPermissionsAsync()`, `getExpoPushTokenAsync`, `supabase.rpc("register_push_token", { p_token: token, p_platform: Platform.OS })`; `send-push-notification/index.ts`: `.from("push_tokens").select("expo_push_token")` and `fetch(EXPO_PUSH_URL, ...)`; deletion migration: `delete from public.push_tokens where user_id = p_user_id`. |
| Device or other IDs — **Android device ID / advertising ID** | No collection evidence found. **UNSURE whether any transitive Expo/Sentry/Google component automatically collects an identifier**, because that is not inferable from source alone; Sentry is disabled in checked-in production configuration. | N/A. | N/A. | N/A. | No code references to Advertising ID, `getAndroidId`, IMEI, MAC address, or Google/Firebase Analytics; direct dependency list has no Firebase Analytics/Ads SDK. |
| Personalization / app settings — **Notification preferences and read/archive state** | Local-only; no code sends preferences/read state to the backend. This normally is not “collected” under the stated definition, but should be considered in the Console if local processing must be declared under a different interpretation. | Optional; user can change categories/read/archive state. | Filter notification center/badge and preferences UI. | AsyncStorage until changed/cleared/reinstall. | `notificationPreferences.ts`: “Device-local ... no server round-trip needed” and `AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated))`; `notificationsService.ts`: `const READ_IDS_KEY = "medveda:notifications:readIds"`, `ARCHIVED_IDS_KEY`. |
| Files and docs / downloads — note PDFs, downloaded quiz bundles, content/title/subject/chapter/year metadata, source URL, local file path, size/status | The actual selected content is downloaded from its source URL and all listed metadata/files are stored on-device. **No evidence that download history/files are uploaded to a third party as a download record.** Remote content provider is Supabase-protected content storage/URLs, but exact storage provider request logging is outside the repo. | Optional; only when a user downloads content. | Offline notes/quizzes, resume/retry/download management. | Stored locally in SQLite and application document storage; user can delete individual/all downloads. | `config/database.ts`: `CREATE TABLE ... downloads` with `source_url`, `local_uri`, titles, IDs, status, size; `downloadManager.ts`: `new FileSystem.DownloadResumable(request.sourceUrl, fileUri, ...)`; `downloadManager.ts`: `DELETE FROM downloads;`. |
| Local learning state — bookmarks, reading progress, watch history | Yes when queued/synced: the offline outbox sends these to Supabase tables; payload field shapes are not defined in the inspected source. | Optional; follows user content interactions. | Cross-session progress/bookmarks/watch history and offline sync. | Local SQLite/outbox, then remote after sync; **UNSURE about precise retained fields and retention**. | `config/database.ts`: `entity_type TEXT ... 'bookmark' | 'reading_progress' | 'watch_history'`; `syncEngine.ts`: chooses `"bookmarks"`, `"reading_progress"`, or `"watch_history"` and `.upsert(item.payload, { onConflict: "id" })`. |

### Explicit non-findings

No source evidence was found for collection of precise/approximate location,
contacts, calendar, photos, videos, audio recordings, SMS/call logs, health
data, browsing history, installed apps, or advertising identifiers. This is a
code finding, not a guarantee about SDK runtime behavior. `PrivacyScreen.tsx`
also states: “We do not collect your location, contacts or photos.”

## Third-party SDKs and service recipients

The following are the direct dependencies/services with data-relevant behavior
or a credible path to receive data. UI/framework libraries (React,
React Navigation, gesture/reanimated/safe-area/screen components, icons,
forms/Yup, fonts, clipboard, status bar, datetime picker, etc.) have no
app-code evidence of transmitting user data. Their dependency presence alone
does not prove collection.

| SDK/service | What this app sends or makes available | Reachability / conclusion |
|---|---|---|
| `@supabase/supabase-js` / Supabase | Auth credentials and registration metadata; profile, user IDs, course/year, referrals; analytics including search terms; quiz scores; purchase/order records; push tokens; sync payloads; protected content requests. | Active and core backend: `config/supabase.ts` calls `createClient(...)`; services use `supabase.from`, `.rpc`, and `.functions.invoke`. Treat as a service provider unless Play Console guidance/contracts say otherwise. |
| `expo-notifications` / Expo Push Service | Expo push token plus title/body/data notification payloads via the backend. | Active in a non-Expo-Go native build after OS permission. `pushNotifications.ts` gets token; `supabase/functions/send-push-notification/index.ts` POSTs token messages to `https://exp.host/--/api/v2/push/send`. |
| `@sentry/react-native` / Sentry | Scrubbed crash/error event, conditional on DSN. App suppresses default PII/user/request/extra, console/navigation breadcrumbs, screenshots/view hierarchy, and removes query strings. Exact automatic SDK context is UNSURE. | Code is active at startup, but `enabled: !__DEV__ && Boolean(dsn)`. Checked-in `eas.json` production omits `EXPO_PUBLIC_SENTRY_DSN`, so disabled for that profile absent externally injected EAS environment variables. |
| Razorpay `checkout.js`, loaded in `react-native-webview` | Razorpay order ID, amount, currency, product description, MedVeda name, optional name/email prefill; user’s payment-method credentials are entered in Razorpay UI. Edge function also sends user ID/product ID/internal order ID as Razorpay order notes. | Reachable: HTML has `<script src="https://checkout.razorpay.com/v1/checkout.js">` and immediately creates `new Razorpay(options)`. `react-native-razorpay` is **not** in `package.json`; only a stale TypeScript declaration exists. |
| `expo-file-system`, `expo-sqlite`, AsyncStorage, `react-native-blob-util`, `react-native-pdf` | Local download files/metadata and offline records; network retrieval of selected protected PDF/content URLs. | Used for offline functionality. No code evidence that these SDKs independently send local database/download data to an analytics provider. |
| `expo-secure-store` + `aes-js` | Stores only the AES key in Android Keystore; encrypted Supabase session blob is put in AsyncStorage. | Local device protection, not a third-party remote recipient. Evidence: `secureSessionStorage.ts`: “keep ONLY the AES key in expo-secure-store”; `await SecureStore.setItemAsync(...)`. |
| `expo-updates` / EAS Updates | The app has an Expo update URL. **UNSURE about automatic request metadata (for example IP or device/update identifiers) that Expo infrastructure receives**, since the source does not describe the runtime protocol. | Enabled by generated manifest metadata. Do not mark an additional Play data type without confirming Expo’s current behavior and account configuration. |
| `@react-native-community/netinfo`, `expo-application`, `expo-constants` | Network reachability and app version/build/platform are used locally and version/build/platform are added to Supabase analytics. | No app-code evidence that these packages independently transmit data. |

For completeness, the remaining direct dependencies in `package.json` are:
`@expo/metro-runtime`, `@expo/vector-icons`, `@hookform/resolvers`,
`@react-native-community/datetimepicker`, `@react-navigation/native`,
`@react-navigation/native-stack`, `expo`, `expo-build-properties`,
`expo-clipboard`, `expo-constants`, `expo-font`, `expo-screen-capture`,
`expo-splash-screen`, `expo-status-bar`, `expo-system-ui`,
`expo-web-browser`, `react`, `react-dom`, `react-hook-form`, `react-native`,
`react-native-gesture-handler`, `react-native-get-random-values`,
`react-native-reanimated`, `react-native-safe-area-context`,
`react-native-screens`, `react-native-url-polyfill`, `react-native-web`,
`react-native-worklets`, and `yup`; development dependencies are `@babel/core`,
`@types/aes-js`, `@types/react`, `babel-preset-expo`, and `typescript`.
No app-code evidence was found that these remaining packages independently
transmit user data. `expo-web-browser`, `expo-screen-capture`,
`expo-clipboard`, and `@react-native-community/datetimepicker` likewise have
no data-sending call in the audited files. The explicit Android plugin list
includes `expo-secure-store`, SQLite, notifications, font, splash, status bar,
web browser, and date time picker.

## Android permissions

Command run successfully from `mobile-app/`:

```sh
npx expo prebuild --platform android --no-install
```

The generated `android/app/src/main/AndroidManifest.xml` was inspected, then
the generated `mobile-app/android/` directory was deleted as requested.

Final active permissions in the generated app manifest:

| Permission | Why it appears / audit finding |
|---|---|
| `android.permission.INTERNET` | Required for Supabase, content downloads, Razorpay checkout, Expo push/updates. |
| `android.permission.POST_NOTIFICATIONS` | Required for user-authorized Android notifications/push. |
| `android.permission.VIBRATE` | Added by notifications support. |

The manifest also explicitly removes `SYSTEM_ALERT_WINDOW`,
`READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, and
`DOWNLOAD_WITHOUT_NOTIFICATION`. Its `<queries>` declaration covers `https`,
`http`, `upi`, and `mailto` intent visibility; queries are not runtime
permissions. The final application sets `android:usesCleartextTraffic="false"`
and `android:allowBackup="false"`.

## Protection, deletion, and retention evidence

* Transport: `mobile-app/app.config.js` sets `usesCleartextTraffic: false` and
  comments that release builds “only talks to https endpoints.” Supabase URL,
  Expo update URL, Razorpay script URL, and Expo push URL in source are HTTPS.
  This does not independently prove every server redirect or every third-party
  endpoint uses TLS.
* Session storage: `secureSessionStorage.ts` encrypts the Supabase session
  before AsyncStorage, generating a 256-bit AES key and storing that key in
  `expo-secure-store`/Android Keystore. Other local data — recent searches,
  preferences, pending referral email/code, download metadata, quiz answers,
  and content files — is stored in AsyncStorage/SQLite/files and is **not
  shown as separately encrypted by this code**.
* Account deletion: `usersService.deleteAccount()` invokes `delete-account`
  before local sign-out. The Edge Function authenticates the bearer token,
  calls `erase_user_data`, then deletes the Auth user. The migration deletes
  analytics, quiz scores, push tokens, payment sessions, purchases, referrals,
  and profile, while anonymizing payments/orders by nulling `user_id` for tax
  retention. This is source evidence only; deployment of the function and
  migration must be verified separately.
* Local deletion: downloads can be removed individually/all; recent search and
  chapter history have clear functions; push token is deleted on logout.
  Account deletion source does not itself wipe every local non-session value,
  so **UNSURE** whether all local artifacts are wiped on every deletion path.
* Retention: privacy UI claims account deletion within 30 days, payment/invoice
  records up to 8 years, and crash/usage up to 12 months. The code has an
  analytics purge function, but its migration explicitly warns the scheduled
  job may not be installed. Treat the actual retention schedule as **UNSURE**
  pending production database/scheduler and vendor-console verification.

## Feature/configuration switches

* At the 2026-10-09 baseline, `IN_APP_PURCHASES_ENABLED` was not found in
  `mobile-app/` source/configuration or `package.json`. Re-audit the final UCB
  build and any remote feature flags before filing.
* The Google Play build selects Google Play Billing only. Razorpay checkout is
  available only in the separately configured non-Play distribution profile.
  Declare purchase data paths that are reachable in the exact submitted build;
  do not declare UCB transaction reporting or buyer-state collection for the
  Play build unless those features are later approved and enabled.
* Sentry: production profile in `eas.json` does not include
  `EXPO_PUBLIC_SENTRY_DSN`; therefore Sentry is disabled by the app’s own
  `enabled` condition for that checked-in profile. EAS secrets/environment
  configuration outside git could supply it, which would make crash data apply.

## Questions to confirm in Play Console help

Do not resolve these by assumption; they are policy/contract questions rather
than facts established by source code.

1. Under the current Play definition of “shared,” should Supabase, Expo Push,
   Sentry, Razorpay, and Expo Updates be marked as sharing or as processing by
   service providers? The code and privacy UI describe Supabase/Razorpay/Expo/
   Sentry as service providers, but the declaration must follow Play’s current
   definition and the applicable contracts.
2. Does the embedded Razorpay Checkout make payment credentials a developer
   “collected” financial-data type for this app’s declaration, even though the
   app code never reads/stores them and Razorpay renders the entry UI?
3. Is Expo’s automatic infrastructure data for EAS Updates and Expo Push (for
   example IP address, device/update identifiers, token receipt telemetry)
   reportable in the developer declaration? Obtain current vendor disclosures
   and account configuration details.
4. If Sentry DSN is injected from the EAS dashboard rather than `eas.json`,
   which exact Sentry default device/diagnostic fields are sent after the local
   `beforeSend`/breadcrumb scrubbers run? Confirm with a production-like test
   event and Sentry’s SDK disclosure.
5. Are the analytics purge jobs actually scheduled/enabled in the production
   Supabase project, and what are the vendor-side retention periods for
   Supabase, Expo, Razorpay, and Sentry?
6. Does the deployed account-deletion Edge Function and migration exactly match
   this repository revision, and is there a separate routine to wipe all
   on-device SQLite/AsyncStorage/files after account deletion?
7. For the UCB release, how does Play Console classify the buyer-selected
   Indian billing state: Personal info → Address, Location → Approximate
   location, or both? Record the Console answer and ensure the privacy policy
   and release behavior match it.

## Short Play Console section-order summary

| Play Console section | Data to consider declaring from this audit | Sharing/processing and key condition |
|---|---|---|
| Personal info | Name, email, phone number, course/year (other personal info) | Supabase; name/email also Razorpay checkout. Registration fields are required. |
| Financial info | Purchase history; potentially payment credentials | Supabase/Razorpay. Purchases optional. Payment-credential classification requires confirmation. |
| Location | No device-location collection found in the baseline. UCB adds a buyer-selected Indian billing state. | Review Address and possibly Approximate location for the new billing-state input under Play's definitions; no location permission is needed for manual selection. |
| Messages | None found | Notification content is received/sent as push payload, not user messages. |
| Photos and videos / Audio files / Files and docs | Downloaded note PDFs and quiz bundles are local; no evidence of upload/history collection | Do not mark as collected solely for local storage without confirming Play definition. |
| Calendar / Contacts / App activity | Quiz scores, study events, search terms/history, app/content interactions, local recent chapters/streak | Supabase analytics/sync; local history/streak. Search terms are remotely logged. |
| Web browsing | None found | No browsing-history collection evidence. |
| App info and performance | Crash/error reports and app/device details only if Sentry DSN is present; app version/build/platform analytics | Sentry conditional; Supabase app-open analytics active. |
| Device or other IDs | Expo push token, platform; user UUID under identifiers | Push token to Supabase/Expo only after permission. No ad ID evidence. |
