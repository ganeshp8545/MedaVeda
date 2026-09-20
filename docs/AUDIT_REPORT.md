# MedVeda — Full Audit Report

Audit date: 2026-09-20. Scope: `mobile-app/`, `admin-panel/`, `website/`, `supabase/`, `docs/`.
Method: read the code, migrations, edge functions and the production schema dump in `docs/live-schema/live_schema.sql` (schema-only `pg_dump` of production, 2026-09-20), and ran the type/build/lint commands. **Nothing was changed except this file (and `docs/REFERRAL_PLAN.md`).**

**Legend.** ✅ Working · ⚠️ Partially working / buggy · ❌ Broken · 🆕 Missing (not built). Anything I could not prove from code or the schema dump is marked **unverified**, with the reason.

**Read this first — the live database is behind the repo.** `docs/live-schema/MISMATCHES.md` says the five migrations from `20260919120000` onward were still *pending* on production when the dump was taken. Nothing in the repo shows they have been applied since. Everything that depends on them (courses, course-scoped RLS, referral tables, `set_my_course_year`, `app_config`, account deletion) is therefore **unverified live**. Where the live dump and the repo disagree, I say which one I am describing.

---

## 1. Summary

**Overall health: the code base is tidy and type-clean, but the payment/security layer has two critical holes that let a logged-in student obtain paid notes without paying, and the referral system is a tracker that pays nothing and shows nothing.**

Top 5 critical problems:

1. **Any signed-in user can grant themselves a paid purchase without paying.** Production grants `EXECUTE` on `grant_razorpay_payment()` to `anon` and `authenticated` (`docs/live-schema/live_schema.sql:8261-8262`). The function is `SECURITY DEFINER` and has no caller check. Every migration only runs `revoke … from public`, which does not remove Supabase's default per-role grants, so the hole survives all repo migrations too.
2. **Students can rewrite their own order after the price is fixed.** The `orders` UPDATE policy lets a user change `product_id`, `amount` and `razorpay_order_id`. Pay ₹49 for a cheap product, edit the order to point at an expensive bundle, and settlement grants the bundle (the RPC reads the product from the order).
3. **The production database is behind the repo.** Five migrations are pending. On live, legacy policies still let anyone read the `notes` bucket by name (`"public read notes/thumbnails"`), let a student update their own `blocked` flag, and let a student insert an order already marked `paid`.
4. **Referrals reward nobody.** No discount, credit or payout exists anywhere. Reward values sit in `referral_settings` (default: disabled, no reward, no values) and are never applied. The Refer & Earn screen shows no value, and a code typed at signup is dropped silently when the program is disabled (the default).
5. **New sign-ups lose their name and phone, and phone login/reset call edge functions that are not in the repo.** The app sends `full_name`/`mobile_number` in signup metadata; the live `handle_new_user()` reads only `name`. The app calls `login-with-mobile` and `request-password-reset-by-mobile`; the repo only contains `login-with-identifier` (different name and body shape).

Also notable: the "free first PDF per chapter" preview is enforced only in the UI, and the storage policy would block it for a non-buyer, so it either fails or (if the bucket is public) everything is open. No watermark, no ratings, no coupons, no wallet.

---

## 2. Build / type / lint results

| Check | Result | Notes |
|---|---|---|
| `mobile-app`: `npx tsc --noEmit` | ✅ 0 errors | |
| `mobile-app`: `npx expo-doctor` | ⚠️ 20/21 pass | Fails: *Check Expo config schema* — `mobile-app/app.json` has `expo.splash`, which SDK 57 rejects ("should NOT have additional property 'splash'"). The splash colour/image may be ignored on device (unverified — not run on a device). Already known in `docs/app-errors-report.md`. |
| `mobile-app`: lint | ➖ not configured | No lint script or linter dependency in `mobile-app/package.json`. |
| `admin-panel`: `npx tsc --noEmit -p tsconfig.app.json` | ✅ 0 errors | |
| `admin-panel`: `npm run build` | ✅ builds (172 modules) | I ran `npx vite build --outDir <scratch>` plus the tsc above instead of the literal `npm run build` (`tsc -b && vite build`), so it would not overwrite `admin-panel/dist` or the `.tsbuildinfo` files. Warning: main JS chunk is 572 kB (>500 kB); no code-splitting. |
| `admin-panel`: lint (`npx oxlint`, config `.oxlintrc.json`) | ⚠️ 65 warnings, 0 errors | 41 `no-unused-vars` (e.g. `src/services/chapterService.ts:31,37`, `src/pages/Login.tsx:21`); 12 `react-hooks/exhaustive-deps` (every `use*` hook, e.g. `src/hooks/useYears.ts:19`); 11 `set-state-in-effect` (every `*FormModal.tsx`, `Settings.tsx:21`, `Referrals.tsx:70`); 1 `only-export-components` (`context/AuthContext.tsx:74`). |
| `website`: build | ✅ | No `package.json`. Ran `node scripts/build.mjs` on a scratch copy (it rewrites tracked HTML): "built 17 pages, 14 in sitemap". |
| `website`: `node scripts/check-links.mjs` | ✅ | "17 pages checked, no problems". |
| Secrets scan (tracked files) | ✅ nothing found | Only `.env.example` files are tracked. `eas.json` holds the Supabase URL and a `sb_publishable_…` key, which are public by design. No service-role key or Razorpay secret in client code. |
| Dead dependencies | ⚠️ | `firebase` is in `mobile-app/package.json` and `admin-panel/package.json` but never imported. `expo-constants` is imported by `mobile-app/src/config/supabase.ts` but is not declared in `package.json` (works via transitive install). |

---

## 3. Feature status table

Fix effort: S ≈ under half a day, M ≈ 1–3 days, L ≈ a week or more.

### A. Auth & onboarding

| Area | Feature | Status | File(s) | What is wrong / evidence | Effort |
|---|---|---|---|---|---|
| A | Email signup | ⚠️ | `mobile-app/src/features/auth/authService.ts`, `screens/auth/RegisterScreen.tsx`; live `handle_new_user()` (`live_schema.sql:879`) | App sends `full_name` + `mobile_number` in metadata. Live trigger reads only `raw_user_meta_data->>'name'` and inserts no phone. New profiles get a blank name and no phone. The comment claiming a trigger "persists these fields" is not backed by any migration in the repo. | S |
| A | Email verification | ⚠️ | `authService.ts` (`emailRedirectTo`), `website/assets/js/account-verified.js` | Redirect page exists. Whether "Confirm email" is enforced is a Supabase dashboard setting — **unverified** (not in repo). | S |
| A | Login (email + password) | ✅ | `LoginScreen.tsx`, `authService.ts` | Lockout (`features/auth/loginLockout.ts`) is client-side only, so it is bypassable; Supabase's own rate limits still apply. | – |
| A | Login by mobile number | ❌ / unverified | `authService.ts:signInWithIdentifier`; `mobile-app/supabase/functions/login-with-identifier/index.ts` | App invokes `login-with-mobile` with `{mobileNumber, password}`. The repo function is `login-with-identifier` and expects `{phone, password}`. Whichever is deployed, new users have no phone stored (see signup row), so lookup by `phone_normalized` finds nothing. | M |
| A | OTP / email-code login | 🆕 (dead code) | `authService.ts:sendEmailOtp/verifyEmailOtp` | Defined but no screen calls them. | M |
| A | Password reset (email) | ✅ / unverified delivery | `authService.ts`, `ForgotPasswordScreen.tsx`, `ResetPasswordScreen.tsx`, `website/assets/js/reset-password.js` | Design is sound: https landing page, in-page reset, "Open in app" hand-off with the token. **Resend SMTP is not configured anywhere in the repo** (only mentioned in privacy text), so email delivery is unverified. | – |
| A | Password reset (mobile) | ❌ / unverified | `authService.ts:requestPasswordReset` | Calls `request-password-reset-by-mobile`, which does not exist in the repo. | M |
| A | Duplicate reset screen | ⚠️ | `mobile-app/src/features/auth/ResetPasswordScreen.tsx` | Unused duplicate of `screens/auth/ResetPasswordScreen.tsx` (no import found). | S |
| A | Logout | ✅ | `SideDrawer.tsx`, `ProfileScreen.tsx`, `SettingsScreen.tsx` | Downloaded PDFs stay on the device after logout (`clearAllDownloads` is only wired to a manual action in `useDownloads.ts:92`). | S |
| A | Session persistence | ✅ | `config/secureSessionStorage.ts`, `SplashScreen.tsx`, `config/supabase.ts` | Session encrypted with AES; key in SecureStore. Refresh on foreground handled. | – |
| A | Course/year selection on first launch | ⚠️ (depends on pending migration) | `SelectCourseYearScreen.tsx`, `services/courseState.ts`, `set_my_course_year()` | Gate and validated RPC are well built. Live DB lacks `courses`, `profiles.course_id/year_id` until migrations are applied. A temporary default to `bams` and a NULL-year fallback are in place (`20260920120000`, `20260920140000`). | – |
| A | Blocked users | ⚠️ | `services/authState.ts` | Enforced only in the app (signs out). No server-side check, so a blocked user's existing token still works against the API. Live RLS also lets users edit their own `blocked` (see §4). | S |
| A | Account deletion | ✅ / unverified live | `supabase/functions/delete-account`, `20260921130000_account_deletion_support.sql` | JWT-only, erases via `erase_user_data`, then deletes the auth user. Migration pending live. | – |

### B. Content hierarchy

| Area | Feature | Status | File(s) | What is wrong / evidence | Effort |
|---|---|---|---|---|---|
| B | Course → Year → Subject → Chapter, all 5 courses | ⚠️ | migration `20260919120000` (seeds bams/bnys/bsms/bums/bhms), `Years/Subjects/ChaptersScreen.tsx` | Schema, triggers and screens support all five. Whether BNYS/BSMS/BUMS/BHMS actually have content is **unverified** (row data not in repo). Live DB not migrated yet. | – |
| B | Loading states | ✅ | all list screens | Spinner/skeleton present. | – |
| B | Empty states | ⚠️ | `YearsScreen`, `SubjectsScreen`, `ChaptersScreen` | Plain text ("No Subject Found"); no shared `EmptyState`. | S |
| B | Error states | ⚠️ | `SubjectsScreen.tsx:33`, `ChaptersScreen.tsx:37`, `HomeScreen.tsx` | Errors are `console.error`-only, so a network failure shows "No Subject Found"/"No Chapters Found" with no retry. `NotesScreen`/`VideosScreen`/`TestListScreen` use a one-off `Alert`. Only `MyPurchasesScreen` uses `ErrorState`. | S |

### C. Content access

| Area | Feature | Status | File(s) | What is wrong / evidence | Effort |
|---|---|---|---|---|---|
| C | Notes PDFs locked server-side | ⚠️ | `20260919120000` §10 (`notes_read_if_purchased` → `user_owns_chapter`), `services/secureNotesService.ts` | The repo policy is correct and uses signed URLs. **Live dump still has `"public read notes/thumbnails"` (line 7597)**, which lets anyone read the `notes` bucket by object name. The bucket's public flag is not visible in a schema dump — **unverified**. If it is public, public URLs bypass RLS entirely. | S (apply migration + confirm bucket private) |
| C | Client-side unlock flag | ⚠️ | `NotesScreen.tsx` (`unlocked` from route params, `FREE_PDF_COUNT = 1`) | UI-only gate. It is fine as UX because storage is the real enforcement, but see the free-preview row below. | – |
| C | Free first PDF per chapter | ❌ | `NotesScreen.tsx` | The UI treats the first PDF as free, but `getSecureNoteUrl` needs a signed URL and the storage policy requires a purchase. On a private bucket, non-buyers get an error on the "free" PDF. On a public bucket, every PDF is free. Either way it is wrong. | M |
| C | Videos | ➖ by design | `VideosScreen.tsx` | "MedVeda 2.0: Video Lectures are always free." Videos are YouTube links (`youtube_url`) opened via `Linking.openURL`; rows are readable by same-year students. Note this differs from the brief ("sells notes PDFs, videos and quizzes"): **only notes are paid.** | – |
| C | Quizzes | ➖ by design | `TestListScreen.tsx`, `QuizScreen.tsx` | Free for all. Correct answers ship to the client in `quiz_tests.questions`, acceptable only because quizzes are free. | – |
| C | Row-level access | ⚠️ | `has_content_access()` | A student can read every row in their own course+year without buying, and, while the temporary NULL-year fallback exists, all rows in their course. Only file access (storage) is purchase-gated. Fine for metadata, but the paid file path is what matters. | – |
| C | Course switching | ⚠️ | `set_my_course_year()` | Students may switch course/year freely with no limit. Purchases are course-bound, so there is no bypass, but it is unrestricted. | – |

### D. PDF reader & video player

| Area | Feature | Status | File(s) | What is wrong / evidence | Effort |
|---|---|---|---|---|---|
| D | PDF opening / page nav | ✅ | `PdfViewerScreen.native.tsx` (`react-native-pdf`) | Page badge "Page x / n", pinch zoom, scroll. No jump-to-page, no last-page memory. | M |
| D | Large-PDF performance | ⚠️ unverified | same | `cache: true`, `enablePaging={false}`. No large-file testing in repo. Admin upload limit is 50 MB. | – |
| D | Offline support | ✅ | `utils/downloadManager.ts`, `config/database.ts` (SQLite), `DownloadsScreen.tsx` | Resumable downloads. Files sit unencrypted in `documentDirectory/medveda/notes/`. They are not removed on logout, refund or account switch. | M |
| D | Watermark | 🆕 | – | No watermark anywhere (`grep -i watermark` empty). | M |
| D | Screenshot protection | ⚠️ | `hooks/usePreventScreenshot.ts` | Android: `FLAG_SECURE` (works). iOS: only blurs the app-switcher/recording; screenshots still work (Apple restriction). Applied app-wide. | – |
| D | Video player | ⚠️ | `VideosScreen.tsx` | No in-app player; opens YouTube externally (can't watermark or track progress). | L |

### E. Quizzes

| Area | Feature | Status | File(s) | What is wrong / evidence | Effort |
|---|---|---|---|---|---|
| E | Creation in admin | ✅ | `admin-panel/src/components/QuizFormModal.tsx`, `services/quizService.ts` | Fixed question count, 4 options, answer selection, course chain required. | – |
| E | Attempt / timer / scoring / result | ✅ | `QuizScreen.tsx` | Client-side scoring, timer, pass mark 50%, results card. | – |
| E | Attempt storage | ⚠️ | `services/quizAttempts.ts`, `syncEngine.ts` | Local-first with sync to `quiz_scores` (client-supplied score, upsert by id). Fine for a personal history; not trustworthy for any leaderboard. No review-answers screen found (unverified: not searched exhaustively). | – |

### F. Payments (Razorpay)

| Area | Feature | Status | File(s) | What is wrong / evidence | Effort |
|---|---|---|---|---|---|
| F | Order created server-side | ⚠️ | `services/ordersService.ts`, `create-payment-session`, `pay` | The internal `orders` row is created **by the client** (insert policy). The **Razorpay** order and price are created server-side in `pay` from `products.price` (good). But the row stays client-writable afterwards (see §4 S2). | M |
| F | Signature verified server-side | ✅ | `verify-payment/index.ts`, `_shared/razorpay.ts` | HMAC-SHA256 of `order_id|payment_id` with the key secret; order id must match the stored `razorpay_order_id`. | – |
| F | Webhook | ✅ | `razorpay-webhook/index.ts` | HMAC over the raw body, timing-safe compare, event-id idempotency, secret rotation support, non-2xx on failure so Razorpay retries. | – |
| F | App closes mid-payment | ✅ | `paymentService.ts` (`recoverPaymentWithRetry`), `PaymentCheckoutScreen.tsx` (AppState), webhook | Three layers: client callback, recovery poll on resume, webhook. Solid. | – |
| F | Unlock twice | ⚠️ | `create-payment-session`, `grant_razorpay_payment` | Replays are idempotent (unique `payments.razorpay_payment_id`, `purchases.order_id`, `orders.razorpay_order_id`). But nothing stops a user buying a product they already own via a second order → duplicate paid purchases. | S |
| F | Faked from the client | ❌ | see §4 S1, S2 | Yes, two ways (RPC grant, order rewrite). | S / M |
| F | Purchase linked to user & product | ✅ | `grant_razorpay_payment` (repo version) | Derives scope/course from `products`, not the order. **Live version still copies scope from the order** (`live_schema.sql:810`), which is what enables S2. | – |
| F | Refunds | ⚠️ | `admin-panel/src/services/orderService.ts` | Admin can set an order to `refunded` (allowed by the live CHECK), but that neither refunds via Razorpay nor removes the `purchases` row, so access stays. Setting `paid` by hand grants nothing either. | M |
| F | Discounts in checkout | 🆕 | `pay/index.ts` | Charge = `products.price` only. No coupon, referral or wallet line. | M |
| F | Test-mode guard | ✅ | `_shared/razorpay.ts` | Refuses `rzp_test_` keys unless `ALLOW_TEST_MODE=true`. | – |
| F | Payment result screens | ✅ | `PaymentSuccessScreen`, `PaymentFailedScreen` | Success screen buttons: "View My Purchases" / "Continue Learning" (no "Start reading"). | S |

### G. Referral system

See §5 for the full flow. Status: **⚠️ partially built. Codes, application and tracking work; rewards do not exist.**

| Area | Feature | Status | File(s) | What is wrong / evidence | Effort |
|---|---|---|---|---|---|
| G | Code generation | ✅ (pending live) | migration §12c | 7-char code, unambiguous charset, unique index, backfilled. | – |
| G | Code entry | ⚠️ | `RegisterScreen.tsx`, `utils/pendingReferral.ts` | Only at Register, always shown even when the program is off. None at login, profile or checkout. | S |
| G | Reward for referrer / new user | ❌ | migration note lines 1381–1386, `pay/index.ts` | Not implemented. | L |
| G | Referral screen | ⚠️ | `screens/referral/ReferralScreen.tsx` | Code, copy, share, list with status. No reward value, no stats, no "how it works". Reachable only from Profile and only if the program is enabled. | M |
| G | Admin referral settings + list | ✅ | `admin-panel/src/pages/Referrals.tsx` | Works, but states "no payout … applied automatically". | – |

### H. Admin panel

Pages (16): Login, Dashboard, Courses, Years, Subjects, Chapters, Users, Referrals, Notes, Videos, Quiz, Orders, Products, Notifications, Analytics, Settings. Guarded by `ProtectedRoute` + `am_i_admin()` RPC (server-checked).

| Area | Feature | Status | File(s) | What is wrong / evidence | Effort |
|---|---|---|---|---|---|
| H | CRUD: courses, years, subjects, chapters, notes, videos, quizzes, products | ✅ | `services/*Service.ts`, `pages/*.tsx` | Complete, with course filters everywhere. Course delete is blocked when years exist (`ON DELETE RESTRICT`), with a friendly message. | – |
| H | Prices / MRP | ✅ | `ProductFormModal.tsx` | Has `price` and `originalPrice`. | – |
| H | Users | ⚠️ | `pages/Users.tsx`, `userService.ts` | List and block/unblock only. No user detail (purchases, referrals). | M |
| H | Orders | ⚠️ | `pages/Orders.tsx` | List/status change; no purchase view, no refund action (see F). | M |
| H | Referrals | ✅ | `pages/Referrals.tsx` | Settings and list; status can be set by hand. | – |
| H | Multi-course works end to end | ⚠️ | – | Code is complete in admin and app. Cannot work on live until the migrations are applied (admin queries `courses` and `course_id`). | S (apply) |
| H | Settings | ⚠️ | `settingsService.ts` | Reads `app_settings` (exists live) and `app_config` (pending). | – |
| H | Docs | ⚠️ | `admin-panel/AUTH-SETUP.md` | Stale Firebase/Firestore instructions for a Supabase project. `mobile-app/firestore.rules`, `mobile-app/scripts/verify-signature-selftest.js`, `schena.sql` header are also legacy or reconstructed. | S |

### I. Security — see §4.

### J. Stability & UX

| Area | Feature | Status | File(s) | What is wrong / evidence | Effort |
|---|---|---|---|---|---|
| J | Crash handling | ✅ | `components/ErrorBoundary.tsx`, `config/sentry.ts` | Boundary at root; Sentry enabled outside dev if DSN set (DSN unverified). | – |
| J | Unhandled promises | ⚠️ | `SubjectsScreen`, `ChaptersScreen`, `HomeScreen` | Errors are swallowed with `console.error` only. 86 `console.*` calls in `mobile-app/src`. | S |
| J | Navigation | ⚠️ | `navigation/AppNavigator.tsx` | Single flat stack with all 34 screens registered, no auth-gated navigator. Splash decides the first screen. Deep-link `PaymentSuccess/Failed` routes are marked legacy. | S |
| J | Dead code | ⚠️ | see A, plus `types/react-native-razorpay.d.ts`, `firebase` deps, `src/src/vite-env.d.ts` (admin) | Unused duplicate reset screen, unused OTP helpers, unused Razorpay typings (checkout runs in a WebView), stale comments referring to Firestore. | S |
| J | Theme mismatch | ⚠️ | `AppNavigator.tsx` vs `App.tsx`/`app.json` | Navigation theme `dark: true`, `StatusBar barStyle="light-content"`, but `expo-status-bar style="dark"` and `userInterfaceStyle: "light"`. Two status-bar components fight each other (unverified visually). | S |
| J | Console errors | unverified | – | App not run on a device/emulator in this audit. | – |

---

## 4. Security findings (ranked)

### Critical

**S1 — `grant_razorpay_payment()` is callable by any signed-in user (free purchases).**
- Evidence: `docs/live-schema/live_schema.sql:8260-8263` — `REVOKE … FROM PUBLIC` then `GRANT ALL … TO anon`, `TO authenticated`, `TO service_role`. Live body (lines 810–876) has no caller check. Default privileges (lines 9156–9159) grant `EXECUTE` on new public functions to `anon` and `authenticated` directly, so `revoke … from public` (used in `20260801150000` and `20260919120000`) never removed them, and the later `CREATE OR REPLACE` in `20260921130000` keeps existing grants.
- Exploit (reasoned from code; **not executed**): insert an `orders` row (allowed) for an expensive product with `amount = 1` and `razorpay_order_id = 'x'`, then `rpc('grant_razorpay_payment', {p_event_id:'e', p_razorpay_order_id:'x', p_razorpay_payment_id:'p', p_amount_paise:100})`. The amount check passes against the attacker-written amount and a `purchases` row is created.
- Fix: `revoke execute on function public.grant_razorpay_payment(text,text,text,bigint) from anon, authenticated;` in a new migration, and add a verification query to `supabase/tests/`. Also audit every other `SECURITY DEFINER` function the same way (`erase_user_data`, `purge_*` already revoke `anon, authenticated` explicitly and are fine). **Effort S. Do this first.**

**S2 — Students can edit their order after the price is fixed.**
- Evidence: policy `"Users can cancel own pending orders"` (`orders_purchases_rls.sql`, live line 6979) has `WITH CHECK (auth.uid() = user_id AND status <> 'paid')` and no column restriction. `pay` writes `amount` and `razorpay_order_id` server-side, but the client can then update `product_id`. `grant_razorpay_payment` (repo and live) takes the product from the order.
- Exploit (reasoned, not executed): create an order for a ₹49 chapter, run it through `create-payment-session` and `pay`, then `update orders set product_id = <₹1,999 year bundle>` (same course, once the course trigger is applied; any product on live). Pay ₹49 in Razorpay. Settlement sees a matching amount and grants the bundle.
- Fix: make orders immutable to clients after insert. Revoke column-level `UPDATE` from `authenticated` except a cancel path, or replace client writes with an RPC/edge function; snapshot `product_id` in `payment_sessions` and have the grant use that. **Effort M.**

### High

**S3 — Notes bucket readable by anyone on live.** Live policy `"public read notes/thumbnails"` (line 7597) allows public `SELECT` on both buckets. The repo migration drops it, but it is pending. Bucket public flag is not visible in a schema dump — **unverified**. Fix: apply the migration, confirm `notes` is *private* in the dashboard, and manually test by fetching a `…/object/public/notes/…` URL logged out. **Effort S.**

**S4 — Profile self-escalation on live.** Live `profiles_update_own_or_admin` (line 7276) has `USING (id = auth.uid())` and no `WITH CHECK` (it is ORed with the stricter `"user update own profile"`), so a student can update their own `blocked`, `email`, `phone` etc. Impact today: unblocking themselves. After `20260919120000`, trigger `profiles_before_write` protects `blocked`, `referral_code` and verification flags. **Effort S (apply migration).**

**S5 — Client can insert an order that is already `paid` on live.** Live `orders_insert_own` (line 7196) checks only `user_id`, ORed with the stricter `"Users can create own orders"`. Migration `20260919120000` adds a trigger that blocks this. Impact: inflated revenue analytics, plus it is a building block for S1. **Effort S (apply migration).**

**S6 — Pending migrations.** Five migrations (`20260919120000`, `…130000`, `20260920120000`, `…130000`, `…140000`) plus `20260921120000` and `20260921130000` are not confirmed applied. `20260801_auth_verified_identities.sql` was intentionally skipped live. Follow the apply order in `docs/multi-course-changes.md` §10 and run `supabase/tests/multi_course_checks.sql` afterwards.

### Medium

- **S7 — Duplicate purchases / no server-side "already owned" check** (`create-payment-session/index.ts`). Effort S.
- **S8 — Anonymous analytics insert.** Live `"anyone can log analytics events"` is `FOR INSERT WITH CHECK (true)` (line 7110): anyone with the public key can flood `analytics_events` (the 12-month purge job needs pg_cron, which is not installed). Effort S: add a size limit and rate limit, or require auth.
- **S9 — Unauthenticated `verify-payment` `recover` mode.** Anyone who knows an order id can trigger a Razorpay lookup and a grant. It only ever grants when Razorpay reports a captured payment for that order, so the impact is low (extra Razorpay API calls). Add a rate limit. Effort S.
- **S10 — Referral abuse surface.** No device or phone check: one person can create many email accounts and refer themselves. `apply_referral_code` has no rate limit (brute-forcing 7-character codes is a slow but open path). Addressed in `REFERRAL_PLAN.md`.
- **S11 — Whole-course row visibility.** Temporary NULL-year fallback (`20260920120000`) and `20260920140000` default new signups to `bams`. Marked TEMPORARY; make sure they are removed after the minimum app version passes.

### Low

- **S12 — Downloads unencrypted and persistent** (`downloadManager.ts`): a rooted device can copy the PDFs; they survive logout and refund. No watermark to trace leaks.
- **S13 — Screenshots not blocked on iOS** (platform limit).
- **S14 — `send-push-notification`** (`verify_jwt = false`, admin check inside — OK) logs push tokens and full token rows to the function log (`index.ts`); it also checks `admins.email`, while `am_i_admin()` checks `admins.id`. Use one method.
- **S15 — Client-only login lockout** (`loginLockout.ts`).
- **S16 — `mobile-app/schena.sql`** is a reconstructed schema that disagrees with production and hardcodes an admin email. It is misleading; replace it with a pointer to `docs/live-schema`.
- **S17 — CORS `*`** on edge functions: acceptable, they authenticate with tokens or signatures.

### Checked and fine
Service-role key and Razorpay secrets are not in any client or tracked file. Admin route guard is server-checked (`am_i_admin`). `delete-account` reads only the JWT. `pay` re-derives price from the DB and claims the payment session atomically. Webhook signature handling is correct. Admin `window.supabase` debug handle is DEV-only.

---

## 5. Referral system — current flow and everything broken

### How it works today, in plain words

1. **Code creation.** When a profile row is created, a database trigger gives it a random 7-character code (letters A–Z and digits 2–9). Existing users get one from the migration backfill. *(Live has no `referral_code` column until the migration is applied.)*
2. **Where the owner sees it.** Profile → "Refer & Earn" → `ReferralScreen` (copy, share, list of referrals). **The menu item appears only if the admin has turned the program on.** There is no button on Home or in the side drawer.
3. **Where a new user enters it.** Only on the Register screen, in an optional "Referral code (optional)" box. The box is shown even when the program is off. There is no live validation; it only checks the format. Nothing at login, in the profile, or at checkout.
4. **When it is applied.** The code is stored on the phone (`AsyncStorage`, tagged with the signup email). After the user verifies their email and logs in, `HomeScreen` calls `apply_referral_code`. The database checks: program enabled, code exists, not self, referrer not blocked, not already referred, account under 7 days old, no successful purchase yet, referrer under the max limit. On success it inserts a `referrals` row: status `qualified` if the program qualifies on signup, `pending` if on first purchase.
5. **What the referrer gets.** Nothing except a row in their list with a status word (Pending / Qualified / Rewarded / Not eligible) and the friend's first name.
6. **What the new user gets.** Nothing. The checkout charge is the product price only.
7. **First purchase.** If the program qualifies on first purchase, a friend's first successful payment flips `pending` → `qualified`. Nothing follows from that.
8. **Reward.** The admin can open Admin → Referrals and change a status to "Rewarded" by hand. This has no financial effect. The admin screen itself says so.

### Current reward values and where they live

| Setting | Default value | Where defined | Configurable? |
|---|---|---|---|
| Program enabled | **false** | table `referral_settings` (single row `id = true`), `20260919120000` §12a | Yes — Admin → Referrals |
| Reward type | **`none`** (options: `discount_percent`, `discount_flat`, `credit`) | same | Yes |
| Referrer reward value | **NULL** | same | Yes (never used) |
| New-user (referee) reward value | **NULL** | same | Yes (never used) |
| Qualify on | `signup` (or `first_purchase`) | same | Yes |
| Max referrals per user | NULL (unlimited) | same | Yes |
| Code length (7), charset, 7-day apply window | hardcoded | SQL functions `generate_unique_referral_code`, `apply_referral_code` | No |

There are **no hardcoded reward amounts anywhere in the app or admin code.** The live production values are **unverified**: the table does not exist in the 2026-09-20 dump (migration pending), so the Referrals admin page would error against live today.

### Everything broken, confusing, or silently doing nothing

1. **No reward is ever applied** — referrer or friend — even if the admin fills in values. The values are recorded and ignored (`migration lines 1381–1386`; `pay/index.ts` charges `products.price`; no wallet table exists).
2. **The whole feature is invisible by default.** `enabled = false`, so Profile hides Refer & Earn and `ReferralScreen` shows "isn't available right now".
3. **A signup code is silently lost when the program is off.** `applyPendingReferralCode` clears the stored code on any definitive answer, including `disabled`, `too_late`, `invalid_code`, and the user is only alerted on `success`. A typo at signup fails without a message.
4. **The signup box is shown even when referrals are disabled**, so users type a code that will do nothing.
5. **Code is bound to the signup email and this device.** Verify email and log in on another phone, or with a changed email, and the code is never applied.
6. **7-day window is invisible.** A user who verifies late gets `too_late` and never learns why.
7. **No way to enter a code after signup or at checkout.**
8. **`ReferralScreen` does not say what anyone earns.** No headline value, no "how it works", no stats (invited / joined / purchased / earned), no wallet. The sub-text only explains when a referral "counts".
9. **Share message** has no reward text and no personal link; it uses a hardcoded Play Store URL (duplicating `app_config.store_url`) and cannot attribute an install to a code.
10. **The statuses are confusing.** "Qualified" and "Rewarded" mean nothing to a student when nothing is rewarded.
11. **Admin page shows no reward amounts** and no ledger of what was "given". There is nothing to give.
12. **Admin can mark "rewarded" with no check** that the friend paid, or any record of what was rewarded.
13. **Abuse gaps.** Self-referral is blocked by id only. Multiple accounts per person are not detected (no phone/device check; a new email is enough). "Qualified only after verified payment" is only true in `first_purchase` mode; the default is `signup`.
14. **Depends on the pending migration.** Nothing referral-related exists on live today.

---

## 6. Feature gap table

| Feature | Status | Evidence / notes |
|---|---|---|
| Free preview pages of paid notes | ⚠️ | Only "first PDF free" per chapter (`NotesScreen.tsx`), UI-only and broken by the storage policy (see §3-C). No page-level preview. |
| Free sample chapter | ⚠️ | Same mechanism; no admin flag to mark a free chapter. |
| Notes cover image + page count + chapter list on product page | 🆕 | `Product` has no image or page-count field; no product detail screen. Store shows poster cards (`ProductPosterCard.tsx`); chapters are visible through the normal hierarchy. |
| Ratings & reviews | 🆕 | |
| "X students bought" count | 🆕 | Data exists in `purchases`, but RLS hides other users' rows, so an aggregate RPC is needed. |
| Author credentials | 🆕 | |
| PYQ section (university/year-wise) | 🆕 | |
| Important questions / last-minute revision | 🆕 | |
| Exam countdown | 🆕 | Only a daily study reminder (`StudyReminderScreen.tsx`) and an `exam_reminder` notification icon. |
| Bundles / combo packs | ⚠️ | `bundle` scope covers several years of one course; no cross-course or custom combo. |
| MRP strike-through pricing | ✅ | `ProductPosterCard.tsx`, admin `originalPrice`. Whether any product has it set is unverified. |
| Coupon codes | 🆕 | |
| Wallet / credits | 🆕 | `credit` exists only as an unused enum value in `referral_settings`. |
| MCQ of the day + streak | ⚠️ | Streak ✅ (`utils/streakTracker.ts`, `StreakBadge.tsx`; local device only, not synced). MCQ of the day 🆕 (`DailyQuoteCard` is a quote). |
| Push notifications | ✅ (delivery unverified) | Token registration, `push_tokens`, admin broadcast (`send-push-notification`), in-app centre. |
| "Continue reading" | ⚠️ | `ContinueLearningCard` (recent chapters); no PDF page position. |
| Dark mode in reader | 🆕 | White PDF background; app set to light. |
| Bookmarks / highlights | 🆕 | |
| Offline access | ✅ | SQLite + resumable downloads. Unencrypted, not cleared on logout. |
| PDF watermark with user name/phone | 🆕 | |
| Abandoned-cart reminder | 🆕 | `orders` rows with status `created` could feed it. |
| Post-payment success screen with "Start reading" | ⚠️ | Success screen exists; buttons are "View My Purchases" and "Continue Learning". |

---

## 7. Recommended fix order

**Critical (do before anything else, ideally today)**
1. Revoke `EXECUTE` on `grant_razorpay_payment` from `anon, authenticated` (S1). Add a test that calls it as a normal user and expects failure.
2. Lock the `orders` table against client updates of `product_id`, `amount`, `razorpay_order_id`, scope columns (S2); ideally create orders server-side.
3. Apply the pending migrations in the documented order, then re-run `supabase/tests/*.sql`. This closes S3–S5.
4. Confirm in the Supabase dashboard that the `notes` bucket is **private**, and test a logged-out fetch of a note URL.
5. Re-check for abuse: query `purchases` and `orders` for rows with no matching `payments` row (evidence of S1/S2 use).

**High**
6. Fix signup metadata vs `handle_new_user()` (name and phone lost); decide and ship the real mobile-login and mobile-reset edge functions, or remove those options.
7. Fix the "free first PDF" logic: a storage policy or edge function for free notes, and an admin `is_free` flag.
8. Server-side "already owned" check; refund flow that revokes the purchase.
9. Referral redesign (see `docs/REFERRAL_PLAN.md`), including making signup-code loss visible.

**Medium**
10. Real error and empty states on Subjects/Chapters/Home; remove `console.error`-only paths.
11. Add a lint setup to `mobile-app`; clear the 65 admin lint warnings; drop the unused `firebase` dependencies; declare `expo-constants`.
12. Fix the `splash` config in `app.json` per SDK 57.
13. Rate-limit `verify-payment` recovery and `apply_referral_code`; tighten `analytics_events` insert.
14. Clear downloads on logout; encrypt downloads; add watermarking (user name/phone) in the reader.
15. Remove stale docs (`AUTH-SETUP.md`, `schena.sql`, `firestore.rules`, Firebase self-test script).

**Nice to have**
16. Product page with cover, page count and chapter list; "X students bought"; ratings.
17. Coupons, wallet, bundles beyond year, abandoned-cart reminder, PYQ, important questions, exam countdown, MCQ of the day.
18. PDF reader upgrades: jump to page, last position, dark mode, bookmarks, highlights.
19. Code-split the admin bundle; add the "Start reading" button on the success screen.

---

### What I did not verify (and why)
- Live row data (content per course, referral rows, current referral settings): only a schema dump exists in the repo.
- Storage bucket public/private flags: not in a schema dump.
- Supabase dashboard settings (email confirmation, SMTP/Resend, redirect URL allow-list, Razorpay webhook configuration and secrets): not in the repo.
- Which edge functions are deployed (especially `login-with-mobile` / `request-password-reset-by-mobile`): not in the repo.
- On-device behaviour (splash, status bar, PDF performance, push delivery): the app was not run.
- S1 and S2 are reasoned from the schema and code and were **not exercised against any database**.
