# Multi-Course Upgrade — Final Report

Covers the multi-course upgrade (courses above years, course-scoped content and
RLS, admin UI, mobile onboarding) and the referral system. Companion to
`docs/multi-course-analysis.md` (the Phase 1 survey).

**Read section 10 before deploying** — it lists what was *not* verified, the
assumptions to check against the live database, and one product decision that
affects students on old app versions.

---

## 1. Files changed

Two git repos are involved: the outer `AyurPulse` repo (admin-panel, supabase,
docs) and `mobile-app/`, which has its own history.

### supabase/ (outer repo)
- `migrations/20260919120000_multi_course_and_referrals.sql` — new
- `migrations/20260919130000_referral_history_rpc.sql` — new
- `migrations/20260920120000_null_year_course_fallback.sql` — new (TEMPORARY NULL-year fallback)
- `migrations/20260920140000_default_new_profile_course.sql` — new (TEMPORARY: new profiles with no course default to `bams`; test N7 in `null_year_fallback_checks.sql`)
- `migrations/20260920130000_app_config.sql` — new (force-update config table); `tests/app_config_checks.sql` — new
- `functions/create-payment-session/index.ts`, `functions/pay/index.ts` — edited
- `tests/multi_course_checks.sql`, `tests/legacy_backfill_seed.sql`,
  `tests/legacy_backfill_verify.sql` — new; `tests/null_year_fallback_checks.sql` — new (TEMPORARY); legacy check D updated

### admin-panel/ (outer repo)
- Types: `course.ts`, `referral.ts`, `filters.ts` new; `year/subject/chapter/note/video/quiz/product/order/user.ts` gain `courseId` (+ `yearId` on notes, `courseTitle`, user course/year/referral fields)
- Services: `courseService.ts`, `referralService.ts` new; year, subject, chapter, note, video, quiz, product, order, user, analytics, dashboard services take optional `courseId`/`yearId` filters and strip display-only `courseTitle`
- Hooks: `useCourses.ts`, `useReferrals.ts` new; every list hook accepts filters
- Utils: `utils/filters.ts` (`applyContentFilters`, `omitBlankIds`)
- Components: `CoursePicker`, `CourseTable`, `CourseFormModal` new; `SubjectPicker`, `ChapterPicker` gain an optional Course level; all seven `*FormModal`s require the course chain; `SearchBar` gets a `placeholder` prop; `Sidebar`, `YearTable`, `UsersTable` updated
- Pages: `Courses.tsx`, `Referrals.tsx` new; course filter on Years, Subjects, Chapters, Notes, Videos, Quiz, Products, Orders, Users, Dashboard, Analytics; `App.tsx` routes

### mobile-app/ (its own repo)
- Types: `course.ts`, `referral.ts`; `courseId` on Year/Subject/Chapter/Note(+`yearId`)/Video/QuizTest/Product/OwnedScope/Order; `UserProfile` course/year/`referralCode`; `offline.ts`, `navigation.ts`
- Repositories: `coursesRepository`, `referralsRepository` new; optional `courseId` on every "all active" query; profile reads join course/year titles
- Services: `coursesService`, `referralsService`, `courseState` (single source of truth for course/year) new; `usersService.setMyCourseYear`; `yearsService`, `chaptersService`, `productsService`, `searchService` course-aware
- Hook: `useCourseYear`
- Screens: `onboarding/SelectCourseYearScreen`, `referral/ReferralScreen` new; Home, Years, Store, Profile, ChapterDetails, Splash, Login updated; `StudentProfileCard`, `UnlockOptionsPanel`
- Local state: `recentActivity`, `localCache`, `downloadManager`, `config/database.ts`, `useDownloads`, new `pendingReferral`
- `package.json`: `expo-clipboard` (~57.0.2)

**Not committed (your own pending work, mixed with mine):** in `mobile-app/`,
`RegisterScreen.tsx` and `validation/registerSchema.ts` (referral field added
in the working tree), `package-lock.json`, and the non-mine hunks of
`AppNavigator.tsx`, `LoginScreen.tsx`, `SplashScreen.tsx`, `usersService.ts`,
`downloadManager.ts`. Only my hunks of those were committed.

---

## 2. Migrations

### `20260919120000_multi_course_and_referrals.sql` (one transaction, idempotent)
0. Pre-flight row counts (`raise notice`).
1. `courses` (text id, case-insensitive unique `code`) + seed BAMS/BNYS/BSMS/BUMS/BHMS.
2. Adds `course_id` to years, subjects, chapters, notes, videos, quiz_tests, products, orders, purchases, quiz_scores, profiles; `year_id` to notes and profiles; `referral_code` to profiles. All FKs `restrict` on content (no cascade can wipe a course), `set null` on profiles.
3. Backfill parent-to-child; everything defaults to BAMS.
4. Sanity check, then `NOT NULL` (except `profiles.course_id/year_id` — see 10).
5. Indexes on every new FK plus `(course_id, active)` / `(year_id, active)`.
6. Triggers: derive-or-reject `course_id`/`year_id` from the parent on subjects, chapters, notes, videos, quiz_tests, products (bundle years must share one course), orders; after-update propagation when a year/subject/chapter moves; a guard that refuses to move a year to another course while a bundle references it; orders may only be marked paid by the payment system or an admin.
7. Functions: `my_course_id`, `my_year_id`, `has_content_access`, `user_owns_chapter`, `set_my_course_year`.
8. `profiles_before_write`: blocks students from writing `blocked`, `referral_code`, verification flags, `course_id`, `year_id`; clears a year that doesn't belong to the course (no error).
9. RLS: `courses`/`years` readable by everyone when active; subjects/chapters/notes/videos/quiz_tests/products readable by `authenticated` only, when active and `has_content_access`; admin full access; **anonymous content read removed**.
10. Storage policy `notes_read_if_purchased` now goes through `user_owns_chapter` (course-checked).
11. `grant_razorpay_payment()` (same signature): purchase scope/ids/`course_id` come from the **product**, not the order; also qualifies a pending referral on first purchase.
12. Referral system: `referral_settings` (single row, disabled by default), `referrals`, unique code generator + trigger on `profiles`, `apply_referral_code`, RLS.
13. Final consistency check.

### `20260919130000_referral_history_rpc.sql`
`get_my_referrals()` — security definer, referrer-only, returns the referred user's first name only (students can't read each other's profiles under RLS).

---

## 3. Backfill and verification

Every existing year → BAMS, then course/year derived down the hierarchy;
products/orders/purchases derived from their linked row, else BAMS; existing
students → `course_id = 'bams'`, `year_id` left null; every profile gets a
unique referral code. Nothing is dropped or renamed.

Run before/after on the live database (the migration also prints the counts):

```sql
-- row counts must match before and after
select 'years', count(*) from years union all select 'subjects', count(*) from subjects
union all select 'chapters', count(*) from chapters union all select 'notes', count(*) from notes
union all select 'products', count(*) from products union all select 'orders', count(*) from orders
union all select 'purchases', count(*) from purchases union all select 'profiles', count(*) from profiles;

-- expect 0 rows: anything not in BAMS after a BAMS-only backfill
select 'subjects', count(*) from subjects where course_id <> 'bams'
union all select 'chapters', count(*) from chapters where course_id <> 'bams'
union all select 'purchases', count(*) from purchases where course_id <> 'bams';

-- expect 0: notes whose year disagrees with their chapter
select count(*) from notes n join chapters c on c.id = n.chapter_id where n.year_id is distinct from c.year_id;

-- existing purchases still unlock (replace the uid): must be true for a chapter they own
select public.user_owns_chapter('<chapter id>');   -- run as that user via the SQL editor's role impersonation
```

`tests/legacy_backfill_seed.sql` + `legacy_backfill_verify.sql` automate this on
a scratch database (seed, apply migrations, verify) — see section 9.

---

## 4. Admin panel

Courses page (search, active filter, create/edit, activate/deactivate with
confirmation, delete blocked with a "deactivate instead" offer when the course
has years, friendly duplicate-code error). Cascading Course → Year → Subject →
Chapter pickers in all content forms: dependent lists show only the chosen
course, changing a parent clears what's below, Save stays disabled until the
chain is complete, trigger errors show in the form. Course filter on every list
page, Dashboard (with a Courses count) and Analytics. Users table shows
course/year (or "Not selected" / "year not set") and referral code. Referrals
page: settings, table with search/status filter, mark qualified/rewarded/
rejected (with reason).

---

## 5. Mobile app

- **State:** `courseState` loads the profile once after login; `useCourseYear` shares it. `saveCourseYear` calls `set_my_course_year`, and on a course change clears Continue Learning, recent searches, cached lists and the in-memory search index (downloaded files are kept).
- **Onboarding gate:** Splash and Login route to `SelectCourseYear` (Course → Year) when the profile has no course or year (new signups, and existing students who have no year); Home re-checks. Profile has "Change Course / Year" (with a warning before switching course).
- **Course-scoped:** Home (years, year products, latest/recommended chapters, Continue Learning), Years, Store, Search (index built and cached per course), buy options. Home card and Profile show "Course · Year".
- **Years screen decision:** lists only the student's course. Tapping another year is allowed; the database then shows only what they've purchased there. Changing the year is done from Profile.
- **Offline downloads:** `course_id` column via a guarded `ALTER TABLE` (legacy rows → `bams`); the list hides other courses' items without deleting files.
- Subjects, Chapters, Notes, Videos and Quiz screens are unchanged: they navigate by id and RLS is the guard. The Search filter sheet has no Course chip because the index is already one course.

---

## 6. Referrals

Database: settings (disabled by default; reward type, values, qualify on
signup/first purchase, per-user limit), `referrals` (one per referred student,
no self-referral), unique 7-character codes (unambiguous charset) generated by a
trigger and backfilled, `apply_referral_code` (auth required; rejects disabled,
invalid, self, already-referred, account older than 7 days [constant in the
function], already purchased, blocked referrer, over the limit; case-insensitive).
`first_purchase` qualification happens inside `grant_razorpay_payment`
(idempotent). **No payout, wallet or discount is implemented** — rewards are a
recorded status only; applying them is left to you.

Mobile: optional Register field (validated, never blocks signup) — the code is
held on the device tagged with the signup email and applied once that account
has a session. Refer & Earn screen (Profile, only when enabled): code, copy
(`expo-clipboard`), share, history with first names and status, empty state.

Admin: settings form and referrals table/actions.

---

## 7. RLS / security changes

- **Anonymous content read removed** from subjects, chapters, notes, videos, quiz_tests, products. Checked first: no mobile screen or admin page reads content unauthenticated. `courses` and `years` stay public (needed for the picker).
- **Order → purchase tampering.** The task assumed `grant_razorpay_payment` trusted client-written order fields. In fact `pay/index.ts` already overwrote those fields from the product before any charge, so it was not exploitable as written. It still became a real gap once `course_id` existed, so the grant function now derives everything from the product (defense in depth; tested with a tampered order and by mutation). `create-payment-session` now also rejects an order whose scope field doesn't match its product and a product outside the student's course; `pay` snapshots `course_id`.
- **Fabricated paid orders (found during Phase 8).** `schena.sql`'s `orders_insert_own` has no `status = 'created'` check; the real migration's policy does. If the former is live, a student could insert a "paid" order (no content granted, but it inflates admin revenue analytics). Closed with a trigger that works whichever policies exist.
- **Profiles:** students could previously update any column of their own profile (including `blocked`). A trigger now blocks protected columns; `set_my_course_year` is the only path for course/year.
- **Policy audit** (scratch database = `schena.sql` + real migrations + new ones): orders and purchases carry **two overlapping policy sets under different names** (`orders_select_own_or_admin` / `orders_insert_own` / `orders_admin_write` / `purchases_select_own_or_admin` / `purchases_admin_write` from `schena.sql`, versus `"Users can view own orders"` / `"Users can create own orders"` / `"Users can cancel own pending orders"` / `"Admins can view all …"` from the real migrations). Redundant rather than conflicting (permissive policies are ORed), except the insert gap above. None were changed or dropped. profiles, admins, payments, notifications, push_tokens, quiz_scores and storage have no duplicates. **Run the pg_policies query on the live database** — `schena.sql` is reconstructed and may never have been applied.
- `quiz_scores` gets a nullable, backfilled `course_id` (analytics only, not access-controlled).

---

## 8. Environment / configuration

- New package: `expo-clipboard@~57.0.2` (no config plugin). `package.json` line is committed; **`package-lock.json` is not** — run `npm install` and commit it with your pending changes.
- Supabase: apply the migrations (five, in the order listed in the pre-release checklist); redeploy the `create-payment-session` and `pay` Edge Functions. No new secrets, redirect URLs or dashboard settings. Supabase reloads the PostgREST schema cache after DDL; if an embed like `courses ( name )` errors right after migrating, run `notify pgrst, 'reload schema';`.
- Referral program ships **disabled**; enable it in Admin → Referrals.
- `mobile-app/schena.sql` was not updated (it is a reconstructed reference file).

---

## 9. Testing performed

| Check | Result |
|---|---|
| `tsc --noEmit` mobile-app | 0 errors (working tree, and the committed tree on its own) |
| `tsc --noEmit -p tsconfig.app.json` admin-panel | 0 errors. The root `tsc --noEmit` checks nothing here (`files: []`); an earlier phase note claiming it was clean was wrong |
| `npm run build` admin-panel | passes |
| `oxlint` admin-panel | 0 errors, **65 warnings vs 35 before this work**: +16 `no-unused-vars` (destructuring `courseTitle` out before writes, same convention as `yearTitle`), +12 `react-hooks/exhaustive-deps` (the list hooks now re-run on `[filters.courseId, filters.yearId]` without listing their `load` function), +2 `set-state-in-effect` (new `CourseFormModal`, `Referrals`). Not cleaned up |
| SQL: `multi_course_checks.sql` | **13/13 pass** on a local Postgres 17 (rolled back, leaves nothing). Confirmed the suite can fail: disabling the guard trigger and swapping in a grant function that trusts the order each make it fail |
| SQL: `null_year_fallback_checks.sql` | 7/7 pass (N7 = new-profile default); fails (as expected) with the fallback line removed |
| SQL: `app_config_checks.sql` | 5/5 pass |
| SQL: legacy backfill | 4/4 pass: counts unchanged, all BAMS, students backfilled, unique referral codes, chapter/subject/year/bundle purchases (and a purchase with no `product_id`) still unlock exactly their PDFs, an unpaid order unlocks nothing |
| Migration idempotency | second run on a populated database: no errors |
| SQLite `downloads` migration | statements run against a legacy-shaped table: upgraded, re-runnable, filter correct |

Bugs found *by* this testing and fixed: `profiles.course_id NOT NULL` would have
broken every signup (Phase 2); the referral-code backfill was rejected by the
migration's own guard trigger on any database with existing students (Phase 8);
the fabricated-paid-order gap above; and the original SQL test file used
`SET LOCAL` outside a transaction, so it silently tested nothing.

**Not tested — please do before release:**
- Anything on a device or emulator: onboarding, course change, Home, Store, Downloads, Refer & Earn, copy/share, Register.
- The admin UI in a browser against a live Supabase (build and types only).
- The two Edge Functions (no Deno here) and a real Razorpay payment end to end.
- A real Supabase stack: PostgREST embeds (the referral join `profiles!referrals_referrer_id_fkey`, `courses ( name )`), the Storage API, real JWTs. The SQL ran on plain Postgres with stubbed `auth`/`storage` schemas and role names.

### Manual test steps

**Onboarding (new student):** Register (leave referral blank) → verify email → Login → expect `Choose Your Course` → pick a course → pick a year → Continue → Home shows "Course · Year" on the profile card and only that course's years. Kill and reopen the app: goes straight to Home.
**Existing student (backfilled):** Login → expect the picker with the course preselected and no year chosen → pick a year → Home.
**Offline/retry:** turn off data on the picker → error state with Try Again; restore → loads.
**Course change:** Profile → Change Course / Year → choose another course → confirm the warning → Home: Continue Learning and recent searches are empty, Years lists the new course, Search returns only the new course. Downloads no longer lists the old course's items; switch back and they return.
**Access:** as a BAMS Year 1 student open a Year 2 subject (from Years) → empty unless purchased. Buy a Year 2 chapter → it now appears and its PDF opens; a BHMS student cannot open that PDF.
**Payments:** buy a chapter, subject and year pack; confirm the purchase row has the right `scope`/`course_id`; retry the webhook (should be a no-op). Try buying another course's product (should fail with a course message).
**Referrals:** admin enables the program → student A opens Profile → Refer & Earn, copies and shares the code → new student registers with it → logs in → A's history shows the friend's first name as Pending/Qualified per the qualify rule. Repeat with own code, a wrong code and a second code: no crash, registration unaffected. Admin: mark rewarded / reject with a reason.
**Admin:** create a course, a year under it, a subject/chapter/note (course picker limits every dropdown); try deleting a course that has years (blocked, offers deactivate); deactivate a course and confirm students stop seeing it.

---

## 10. Remaining issues, assumptions and deploy order

### Existing students on old app versions — decided: temporary NULL-year fallback
Backfilled students have a course but **no year**, and the strict rule in
`has_content_access` would show them no free content until they update the app
and pick a year. Decision: a student whose profile has `course_id` set and
`year_id` NULL may see all **active** content of **their own course** (never
another course). Implemented only in `has_content_access()` by the new migration
`20260920120000_null_year_course_fallback.sql` (the committed migration is
untouched; the new file re-creates the function with one extra line, marked
`TEMPORARY – remove after min app version X`).

- Course isolation is unchanged: `profiles.course_id` must equal the row's course; a NULL course matches nothing.
- Once `year_id` is set the strict course+year rule applies again.
- Storage is untouched: PDFs remain purchase-gated (`user_owns_chapter`), same as for a student who has picked a year. The fallback only affects row visibility (subjects/chapters/notes/videos/quiz_tests/products).
- Tests: `tests/null_year_fallback_checks.sql` (NULL-year BAMS student gets 0 BHMS rows and cannot read the BHMS PDF, and the mirror case; no-course student sees nothing; strict rule returns once a year is set; inactive content stays hidden). `legacy_backfill_verify.sql` check D was changed to the fallback expectation and marked TEMPORARY.

### Removing the NULL-year fallback
Do this only when **every supported app version** forces the year picker (i.e. after min app version X: `min_app_version` ≥ the first build containing the onboarding gate and the update gate, see below) and a query confirms no student is left with a course but no year:
`select count(*) from profiles where course_id is not null and year_id is null;` → 0 (or accept that the remainder will be prompted).
1. Add a new migration (e.g. `<timestamp>_remove_null_year_fallback.sql`) that `create or replace`s `has_content_access` **exactly as in `20260919120000_multi_course_and_referrals.sql`**, i.e. the profile branch is `pr.course_id = p_course_id and (p_year_id is null or pr.year_id = p_year_id)` — delete the `or pr.year_id is null -- TEMPORARY` line. Do not edit either committed migration.
2. **Remove the new-profile course default** in the same migration: `drop trigger if exists profiles_temp_default_course on public.profiles; drop function if exists public.profiles_temp_default_course();` (from `20260920140000_default_new_profile_course.sql`, marked `TEMPORARY – remove with the NULL-year fallback`). Rows it already defaulted to `bams` stay `bams`; that is correct.
3. Delete `supabase/tests/null_year_fallback_checks.sql`, or at least its check N7 (the new-profile default) — N1–N6 test the fallback itself.
4. **Restore test D's strict assertion** in `legacy_backfill_verify.sql` (check D): a student with no year and no purchases must see **0** subjects, and the subject buyer with no year must see **2** (only the year they bought into). Remove its TEMPORARY comment and change the PASS message back. Leaving D as-is will make the suite fail once the fallback is gone.
5. **Re-run the full SQL suite** (`multi_course_checks.sql`, `legacy_backfill_verify.sql` after `legacy_backfill_seed.sql`, plus any new tests) and confirm every check passes. Then run `grep -rn "TEMPORARY – remove after min app version X" supabase docs` to confirm nothing is left.

### Minimum app version / force-update gate (implemented)
Before this there was no minimum-version mechanism (`expo-updates` was installed but never called, and `runtimeVersion.policy = "appVersion"` means OTA updates cannot reach older binaries). Now:

- **Table:** `app_config(key, value, updated_at)` from `20260920130000_app_config.sql`. Readable by `anon` + `authenticated`; insert/update/delete only for admins (`am_i_admin()`). **Publicly readable — non-secret values only.** Check constraints reject a malformed `min_app_version` (`^\d+(\.\d+){0,2}$`) and a non-`https://` `store_url`, so a typo cannot lock everyone out. Seeded with `min_app_version = 1.0.0` (the current `app.json` version, so nobody is blocked on release day) and `store_url = https://play.google.com/store/apps/details?id=com.ayurpulse.app` (`android.package` in `app.json`).
- **Mobile:** `useForceUpdate` (mounted in `App.tsx`) runs `checkForRequiredUpdate()` on launch and on every return to the foreground. If the installed version is lower than `min_app_version`, `App.tsx` renders the blocking `UpdateRequiredScreen` (button opens `store_url`) instead of the navigator. The installed version comes from `expo-application`'s `nativeApplicationVersion` (the binary's `versionName` / `CFBundleShortVersionString`, per the SDK 57 docs; `Constants.expoConfig.version` can come from an OTA manifest, so it is not used). Versions are compared numerically per part (`1.10.0 > 1.9.0`). **Fails open** on any fetch error, timeout (6 s), web, or missing/malformed value. A successful result is cached for 10 minutes and concurrent calls share one request; failures are not cached, so the next resume retries. The check runs at the app root rather than in `SplashScreen`, so one path covers launch and resume; the app is never held up while it is pending.
- **Admin:** Settings → "App updates" edits `min_app_version` and `store_url` (validated in the form and again in `settingsService` before any write).
- **New dependency:** `expo-application@~57.0.2` in `mobile-app/package.json` (already present transitively; run `npm install` and commit the lockfile). It needs a native rebuild only if your build does not already include it (it ships with Expo).
- **Tests:** `tests/app_config_checks.sql` (anon reads; anon and a student cannot write; an admin can insert/update/delete; malformed values rejected).

**Bumping `min_app_version`:** only after the build with that version is **live on the Play Store for everyone** (staged rollouts included). Then Admin → Settings → App updates → set "Minimum app version" (e.g. `1.1.0`) → Save. Takes effect on each student's next launch/resume. To roll back, set it lower again. Builds released *before* this gate cannot be forced; only builds containing it honour the setting.

**Releasing the gate itself:** the first build containing the gate must have `app.json` `version` ≥ what the seed says (`1.0.0`) — don't raise `min_app_version` above the version you actually shipped.

**Removing the NULL-year fallback:** allowed once `min_app_version` ≥ the first build that contains **both** the year-onboarding gate (Phase 6) and this update gate. From then on every build that can still open the app forces a year to be chosen. Follow "Removing the NULL-year fallback" above, including the `year_id IS NULL` count check, since students who never open the app after the bump keep a NULL year until they do.

### Final pre-release checklist

**A. Before anything (do once)**
1. Take a database backup / point-in-time-recovery marker.
2. Run the policy query (section 7) and the "Schema assumptions" checks below on the **live** DB; fix surprises first.
3. Confirm the live Play Store `versionName` / `versionCode`, then set `mobile-app/app.json` above them (current file: `version 1.0.0`, `android.versionCode 3`; proposed `1.1.0` / `4`, or higher if the store is already past 3). `appVersionSource` is `local`, so `app.json` is the source. Do this **before** building.
4. Run everything below on **staging first**, then live.

**B. Database — apply in this exact order** (all already-committed earlier migrations are assumed applied; Supabase SQL editor or `supabase db push`)
1. `20260919120000_multi_course_and_referrals.sql` — courses, columns, backfill, RLS, referrals, `grant_razorpay_payment`. Aborts with an exception if the backfill leaves gaps.
2. `20260919130000_referral_history_rpc.sql` — `get_my_referrals()`.
3. `20260920120000_null_year_course_fallback.sql` — TEMPORARY NULL-year fallback (must come after 1; it replaces `has_content_access`).
4. `20260920130000_app_config.sql` — `app_config` + seed (`min_app_version = 1.0.0`, store URL).
5. `20260920140000_default_new_profile_course.sql` — TEMPORARY: new profiles with no course default to `bams` (so signups from old app builds see content). Independent of 3 and 4; must come after 1. Effect on the new app: a fresh signup reaches the picker with BAMS preselected and still must pick a year.
Then run `notify pgrst, 'reload schema';` and the verification queries in section D.

**C. Deploy (in this order)**
1. **Edge Functions, right after the migrations:** `supabase functions deploy create-payment-session` and `supabase functions deploy pay` (they read `products.course_id`, so never before migration 1). No other function changed: `razorpay-webhook`, `verify-payment`, `send-push-notification` need no redeploy (the webhook just calls `grant_razorpay_payment`, whose new body is in migration 1). No new secrets.
2. **Admin panel, promptly after step B:** the old admin creates years without a course (rejected by the new `NOT NULL`), and the new Settings page reads `app_config` (migration 4 must already be applied).
3. **Mobile build:** `npm install` (commit the lockfile: adds `expo-application`, and check `@sentry/react-native` / `expo-updates` are in it), bump `app.json` per A3, `eas build --platform android --profile production`, then `eas submit` / Play Console upload; use a staged rollout.
4. In the admin: Referrals stays **disabled** until you turn it on.
5. Only after the new build is live for everyone: raise `min_app_version` to the new version (Admin → Settings → App updates). Then remove the NULL-year fallback **and** the new-profile course default (see "Removing the NULL-year fallback").

**D. Verification queries on live, after B** (expected result in comments)
```sql
-- 1. All four migrations took effect
select to_regclass('public.courses') is not null            as courses,
       to_regclass('public.referrals') is not null           as referrals,
       to_regclass('public.app_config') is not null          as app_config,
       to_regprocedure('public.get_my_referrals()') is not null as referral_rpc,
       pg_get_functiondef('public.has_content_access(text,text)'::regprocedure) like '%TEMPORARY%' as null_year_fallback;
-- all true

-- 2. Backfill is complete (expect 0 on every line)
select 'null course: subjects',  count(*) from subjects  where course_id is null
union all select 'null course: chapters',  count(*) from chapters  where course_id is null
union all select 'null course: notes',     count(*) from notes     where course_id is null
union all select 'null course: videos',    count(*) from videos    where course_id is null
union all select 'null course: quizzes',   count(*) from quiz_tests where course_id is null
union all select 'null course: products',  count(*) from products  where course_id is null
union all select 'null course: purchases', count(*) from purchases where course_id is null
union all select 'notes year <> chapter year', count(*) from notes n join chapters c on c.id = n.chapter_id where n.year_id is distinct from c.year_id
union all select 'profiles without referral code', count(*) from profiles where referral_code is null;

-- 2b. TEMPORARY default trigger present (expect true)
select exists (select 1 from pg_trigger where tgname = 'profiles_temp_default_course') as new_profile_default;

-- 3. Row counts equal the pre-migration counts you recorded (section 3 query)

-- 4. Students: everyone is BAMS; the NULL-year list is who still needs to pick a year
select course_id, year_id is null as no_year, count(*) from profiles group by 1, 2;

-- 5. RLS is on, and content is not anonymously readable
select relname, relrowsecurity from pg_class
 where relname in ('courses','years','subjects','chapters','notes','videos','quiz_tests','products',
                   'app_config','referrals','referral_settings') and relnamespace = 'public'::regnamespace;   -- all true
select tablename, policyname, roles from pg_policies
 where tablename in ('subjects','chapters','notes','videos','quiz_tests') and 'anon' = any(roles);   -- 0 rows

-- 6. app_config seed
select key, value from app_config;   -- min_app_version = current live version, store_url = https://play.google.com/...

-- 7. Referral program ships off
select enabled from referral_settings;   -- false

-- 8. Duplicate policy sets on orders/purchases (section 7) — review, don't drop blindly
select tablename, policyname, cmd from pg_policies where tablename in ('orders','purchases') order by 1, 2;
```
Then from outside the DB (anon key, no login):
`curl -s "$SUPABASE_URL/rest/v1/app_config?select=key,value" -H "apikey: $ANON_KEY"` → returns the two rows;
`curl -s "$SUPABASE_URL/rest/v1/subjects?select=id&limit=1" -H "apikey: $ANON_KEY"` → `[]`.
Smoke test with real accounts: one backfilled student (sees own course content, prompted for a year on the new build), one new signup (course + year picker), a BHMS test student (sees 0 BAMS rows and cannot open a BAMS PDF), a small real Razorpay payment (purchase row has correct `scope`/`course_id`), and an old build (still shows BAMS content; not blocked while `min_app_version` is at or below its version).

### Schema assumptions to verify on the live DB (`schena.sql` is reconstructed)
- All content ids are `text`; `purchases.id`/`payments.id` may be `uuid` or `text` (the migration doesn't depend on it).
- `chapters.year_id`, `videos.year_id`, `quiz_tests.year_id` exist and are nullable; `purchases.product_id` exists (added by an earlier migration).
- The `handle_new_user()` trigger really inserts a bare `profiles` row (the reason `profiles.course_id` stays nullable). It was not modified.
- Which orders/purchases policy names are actually deployed (section 7).
- `login-with-mobile` and `request-password-reset-by-mobile` (not in this repo) don't fail on extra `profiles` columns.

### Other design notes and gaps
- `has_content_access` is year-granular: any purchase inside a year makes that year's metadata rows visible; PDFs stay exactly gated by the storage policy.
- Products have their own RLS branch by scope (their `year_id` keeps its old meaning); bundles are visible course-wide.
- Referral window (7 days) is a constant in `apply_referral_code`. No rewards are applied automatically.
- A referral code typed on one device but verified on another is lost.
- Orders table in admin has a course filter but no Course column; mobile Search has no Course chip.
- Switching accounts on one device does not clear the previous user's Continue Learning (pre-existing).
- Rollback notes are in the header of the first migration.
