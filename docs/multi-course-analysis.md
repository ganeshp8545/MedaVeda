# Multi-Course Upgrade — Phase 1 Analysis

Status: **repo survey complete, no code changed yet.** This document is the
required checkpoint before Phase 2 (migration + RLS). Per the task spec,
work stops here pending a "go".

---

## 0. Repo/VCS note

`/home/ganeshp8545/AyurPulse` had no git repo at the outer level. `mobile-app/`
already has its **own independent git repo** with real history and
pre-existing uncommitted working-tree changes — that repo was left
untouched. A new outer repo was initialized covering `admin-panel/` and
`supabase/` only (`mobile-app/` is `.gitignore`d at the outer level so it
isn't shadowed/embedded). Two commits exist so far: baseline snapshot, and
the fix for the accidental embedded-repo add. Future mobile-app commits will
go into mobile-app's own repo; admin-panel/supabase commits go into the new
outer repo.

---

## 1. Schema assumptions (verify against the live DB before Phase 2)

`mobile-app/schena.sql` is **explicitly self-described as reconstructed**
(its own header says so), built from app source code, not the real schema.
Concrete discrepancies/uncertainties found:

1. `handle_new_user()` in schena.sql reads `raw_user_meta_data ->> 'name'`,
   but `authService.registerWithEmailAndMobile` sends `full_name` /
   `mobile_number`. Either the reconstructed trigger is wrong, or the real
   trigger reads different metadata keys than shown. **Do not replace this
   trigger** — extend via a separate trigger on `public.profiles` instead,
   per the ground rules.
2. `payment_sessions`/`payments` in schena.sql are marked "best-effort
   placeholder, NOT confirmed" — however, the **real** migrations
   (`supabase/migrations/20260718_payment_backend.sql` and
   `20260801150000_razorpay_webhook_atomic_grant.sql`) are authoritative for
   these two tables and were read directly; their schema is what Phase 2
   will build on, not schena.sql's placeholder version.
3. App calls Edge Functions `login-with-mobile` and
   `request-password-reset-by-mobile` (per authService) that don't exist in
   this repo (`mobile-app/supabase/functions/` only has
   `login-with-identifier`). These are presumably deployed separately and
   out of scope for this upgrade, but they touch `profiles`/auth, so a
   `course_id`/`year_id` addition to `profiles` should be harmless to them
   (additive column) — flagging in case they do a `select *`.
4. All content IDs are confirmed `text` (years/subjects/chapters/notes/
   videos/quiz_tests/products/orders id columns) both in schena.sql and in
   the real migrations (explicit comment in
   `20260718_payment_backend.sql:6-8` and the `id_type` branching logic in
   `20260801150000_razorpay_webhook_atomic_grant.sql:12-30` that
   defensively supports either `text` or `uuid` for `purchases.id`/
   `payments.id`). New `courses.id` will be `text`.
5. `purchases.id` / `payments.id` actual live type is **unknown** — the
   `20260801150000` migration was written defensively to handle either. Any
   new SQL Phase 2 writes touching these ids must use the same
   `information_schema`-branching pattern, not assume `text`.
6. **Correction (found while test-loading the migration in Phase 2):**
   schena.sql's own RLS section does NOT match the real migrations' policy
   names on `orders`/`purchases` — it defines `orders_select_own_or_admin`,
   `orders_insert_own`, `orders_admin_write`, `purchases_select_own_or_admin`,
   `purchases_admin_write`, while the real, authoritative migrations
   (`orders_purchases_rls.sql`, `20260721_admin_orders_purchases_access.sql`)
   define differently-named policies (`"Users can view own orders"`,
   `"Users can create own orders"`, `"Users can cancel own pending orders"`,
   `"Admins can view all orders"`, etc.) for the *same* access pattern. This
   is exactly the "both orders_insert_own and 'Users can create own orders'
   may exist" scenario the task brief warned about. **Live-DB action
   required**: run `select tablename, policyname from pg_policies where
   tablename in ('orders','purchases');` on the real project — if both
   naming sets are present, they're redundant-but-not-conflicting (Postgres
   ORs permissive policies together, so this doesn't weaken security), but
   should be cleaned up to avoid confusion. This migration does not touch
   orders/purchases SELECT/INSERT/UPDATE policies at all, so it neither
   fixes nor worsens this — flagging for a separate, deliberate cleanup.
7. `mobile-app/schena.sql` has a stray literal `cd` as its last line (line
   557, after the "DONE" comment banner) — harmless leftover artifact, not
   valid SQL, doesn't affect anything since the file is a human reference
   doc, not something ever executed as-is. Noted only for completeness.
7. `quiz_scores.chapter_id` referenced in the OFFLINE_MODE_SETUP.md
   cross-reference note (push_tokens.sql:30-32) — `chapter_id` column may or
   may not exist on `quiz_scores` live; schena.sql's version has no
   `chapter_id` at all. Not blocking for this upgrade (optional
   `quiz_scores.course_id` addition is separately scoped in §6 of the task).

---

## 2. Security gap re-assessment (task item #6)

The task brief assumes `grant_razorpay_payment()` naively trusts
client-written `orders.scope/chapter_id/subject_id/year_id/year_ids`. **This
is only partially true today** — worth flagging since it changes the size of
the Phase 2 fix:

- `supabase/functions/pay/index.ts` (step 6, lines 131-153) already
  **overwrites** `orders.scope/chapter_id/subject_id/year_id/year_ids`
  (and `amount`) from the **product row**, server-side, using the
  service-role client, at the moment `razorpay_order_id` is assigned — in
  the same UPDATE call, so there's no window where `razorpay_order_id` is
  set but the scope fields are still client-tampered.
- `grant_razorpay_payment()` (and both callers, `verify-payment` and
  `razorpay-webhook`) look up the order **by `razorpay_order_id`**, which
  only exists after that `/pay` snapshot ran. So by the time a purchase row
  is written, `orders.scope/chapter_id/...` already reflect the product,
  not the original client insert.
- **Remaining real gap**: `create-payment-session` (step before `/pay`)
  checks `order.product_id === body.productId` and that the product is
  `active`/priced, but does **not** verify the *client-inserted*
  `orders.scope/chapter_id/subject_id/year_id/year_ids` match the
  product's own scope fields before minting a payment session — it doesn't
  need to for security (since `/pay` overwrites them anyway before charging
  anything), but it means a client can freely write nonsense/mismatched
  scope fields into `orders` between insert and `/pay`, which is untidy but
  not exploitable today.
- **Course-awareness gap (the actual new risk)**: once `course_id` is added
  to `products`/`orders`/`purchases`, the `/pay` snapshot step and
  `grant_razorpay_payment()` must be extended to also copy `course_id` from
  the product — otherwise a purchase could end up with a `course_id` that
  doesn't match its own `chapter_id`/`subject_id`/`year_id` (e.g. left null,
  or copied from a stale client-set order field), which **would** be a real
  new gap if not handled in the same migration.
- Recommended Phase 2 approach: (a) extend the existing `/pay` snapshot
  (already the trusted, working mechanism) to also copy `course_id`; (b)
  make `grant_razorpay_payment()` re-derive `scope/chapter_id/subject_id/
  year_id/year_ids/course_id` **directly from `products`** by `product_id`
  (not from `v_order`) as defense-in-depth, since this removes the implicit
  dependency on `/pay` always running first and having run correctly; (c)
  add a validation trigger/check in `create-payment-session` that rejects
  an order whose client-set scope fields don't match its product's, purely
  to fail fast/cleanly rather than silently overwriting later.
- Bottom line for the report: no proof of an *actively exploitable* purchase
  forgery in the current code was found (the `/pay` snapshot closes it), but
  the fix is still worth doing for defense-in-depth and is **required** once
  `course_id` enters the picture, exactly as the task anticipates.

---

## 3. Anonymous/guest content access audit (task item, before removing anon read)

- **mobile-app**: no guest/anonymous browsing screen exists. `SplashScreen`
  routes only to `Home` (session present) or `Login`/`ResetPassword` (no
  session) — no screen fetches content before authentication, and
  `supabase.auth.signInAnonymously()` is never called anywhere in the app.
  Removing anonymous RLS read access is safe from the mobile app's
  perspective.
- **admin-panel**: gated entirely behind `ProtectedRoute` (requires a real
  admin session + `am_i_admin()` true); it never relies on anonymous reads.
- **No separate marketing website or other consumer of the anon key** was
  found in this repo. (The task's own instructions only list
  `mobile-app/`, `admin-panel/`, `supabase/` as the repo's contents — no
  `website/` directory exists here, unlike the sibling CampusEduX project
  mentioned in the environment info, which is unrelated.)
- Conclusion: anonymous read removal from `years/subjects/chapters/notes/
  videos/quiz_tests/products` (with `years`/`courses` kept anonymously
  readable per the new spec, for onboarding pickers) appears safe to do in
  Phase 2, pending a live-DB check that nothing else (e.g. a Zapier
  integration, a BI tool, an old app version still shipped in the Play
  Store) depends on anonymous reads — noted for the final report's
  "old app versions lose anonymous access" caveat.

---

## 4. File inventory — mobile-app (`mobile-app/`)

### Types (`src/types/`)
`year.ts`, `subject.ts`, `chapter.ts`, `note.ts`, `video.ts`, `quiz.ts`,
`product.ts`, `purchase.ts`, `order.ts`, `user.ts`, `search.ts`,
`download.ts`, `offline.ts`, barrel `index.ts`. Every hierarchy type
denormalizes `yearId`/`yearTitle` (and `subjectId`/`subjectTitle`) — each
needs a parallel `courseId`/`courseTitle` field.

### Repositories (`src/repositories/`)
`yearsRepository.ts`, `subjectsRepository.ts`, `chaptersRepository.ts`,
`notesRepository.ts`, `videosRepository.ts`, `quizRepository.ts`,
`productsRepository.ts`, `ordersRepository.ts`, `purchasesRepository.ts`,
`usersRepository.ts`. All embedded-join selects
(`*, subjects ( title ), years ( title )`) need a `, courses ( title )`
sibling wherever `courseId` is denormalized. "Global" (unscoped) functions
that must become course-scoped: `getAllActiveSubjects`, `getAllActiveNotes`,
`getAllActiveVideos`, `getAllActiveQuizTestsLite`, `getAllActiveProducts`,
`getChaptersOrderedByCreatedAt`, `getActiveChapters`, `getBundleProducts`.

### Services (`src/services/`)
`yearsService.ts`, `subjectsService.ts`, `chaptersService.ts`
(`fetchLatestChapters`/`fetchRecommendedChapters` are cross-subject/global
today — must be scoped to the active course), `notesService.ts`,
`videosService.ts`, `quizService.ts`, `productsService.ts`,
`ordersService.ts` (scope switch has no `"course"` case),
`purchasesService.ts` (`isChapterUnlocked`/`isProductOwned` — the unlock
chokepoints, need a course-match branch), `usersService.ts`,
`paymentService.ts`, `searchService.ts` (builds one global cross-course
index — needs course scoping), `authState.ts` (does **not** cache a
profile at all today — only the raw auth `User`; this is the natural spot
to add the single source of truth for `courseId/yearId`).

### Screens (`src/screens/`)
Home, Years, Subjects, Chapters, ChapterDetails, Notes, Videos, TestList,
Quiz, Store, MyPurchases, Search + `SearchFiltersSheet`, Downloads, Profile,
EditProfile, Register — all listed with specifics in the mobile-survey
findings above; all need `courseId` threaded through navigation params
(`types/navigation.ts` has **no** `courseId` param anywhere today).

### Device-local state (all lack `courseId` today)
`utils/recentActivity.ts` (`medveda:recentChapters`), `utils/localCache.ts`
(cache keys are parameterized by parent id already — straightforward to
extend), `utils/recentSearches.ts` (no entity awareness, no change needed),
`config/database.ts` (`downloads` table — needs `ALTER TABLE ADD COLUMN
course_id` in `initDatabase`), `utils/downloadManager.ts` (hardcoded column
lists in `rowToItem`/`upsertRow`), `services/syncEngine.ts` (opaque JSON
payloads — no change needed).

### Auth / referral
`features/auth/authService.ts` — `registerWithEmailAndMobile` sends only
`full_name`/`mobile_number`; zero referral code anywhere in the app.
`RegisterScreen.tsx` has no course selection UI.

---

## 5. File inventory — admin-panel (`admin-panel/`)

### Reusable components to extend/mirror
`Modal.tsx`, `Button.tsx`, `Input.tsx`, `ConfirmDialog.tsx`, `SearchBar.tsx`
(hardcoded placeholder — needs a `placeholder` prop for reuse),
`SubjectPicker.tsx` (Year→Subject cascade — template for a course-aware
cascade one level up), `ChapterPicker.tsx` (Year→Subject→Chapter cascade),
`*Table.tsx` × 10, `*FormModal.tsx` × 7, `OrderFilter.tsx`/
`ProductFilter.tsx` (enum-only filters — no generic Year/Course filter
component exists; every page hand-rolls its own inline filter `<select>`),
`StatCard.tsx`.

### Pages / services / hooks
Years, Subjects, Chapters, Notes, Videos, Quiz, Products, Orders, Users,
Analytics, Dashboard — each has a matching `*Service.ts` + `use*.ts` hook.
**Key finding**: `subjectService.getSubjectsByYear(yearId)` and
`chapterService.getChaptersBySubject(subjectId)` already exist as filtered
functions but aren't wired into their hooks/pages yet — this is the exact
template to follow for `getYearsByCourse(courseId)` etc.

### Navigation / auth
`Sidebar.tsx` (flat `menus` array — trivial to add Courses/Referrals
entries), `App.tsx` (route registration), `AuthContext.tsx` (calls
`am_i_admin()` RPC on every auth change), `ProtectedRoute.tsx` (guards the
whole `AdminLayout` route group — new pages are automatically protected).

### Types / styling
One file per entity under `src/types/`, `Product`/`ProductScope` will need
a `courseId`/`courseIds` field if a course-level product scope is added
(not required by the current spec — course purchases aren't in scope,
only course-aware filtering of existing scopes). Tailwind v4, CSS-first
config, no theme tokens file — `green-700` is the hardcoded brand color
throughout; new pages copy utility classes directly from `YearTable.tsx`/
`YearFormModal.tsx` as the closest precedent.

### Users page
`AppUser` type has no course/year fields; `getUsers()` does a bare
`select("*")` on `profiles` — adding course/year display needs either a
join or reading the new denormalized columns directly.

### Referral remnants
None found anywhere in admin-panel.

---

## 6. File inventory — supabase (`supabase/`)

### Migrations (chronological, all read directly)
- `20260718_payment_backend.sql` — adds order payment columns,
  `payment_sessions`, `payments` (+ RLS: users can view own payments).
- `orders_purchases_rls.sql` — RLS for `orders`/`purchases` (own-row
  read/insert/cancel only; **no insert/update policy for purchases at all**
  for the `authenticated` role — purchases can only be written by
  service-role, which is the key protection against forged purchases).
- `20260721_admin_orders_purchases_access.sql` — adds admin-read/update
  policies alongside the student ones (additive, doesn't weaken existing).
- `20260801150000_razorpay_webhook_atomic_grant.sql` — adds purchase/
  payment columns, unique indexes, `razorpay_webhook_events`, and
  `grant_razorpay_payment()` (see §2 above for the detailed trace).
- `20260801_auth_verified_identities.sql` — adds `email_verified`/
  `mobile_verified`/`updated_at` to `profiles` + a `touch_profile_updated_at`
  trigger (this is the trigger pattern Phase 2 should follow for
  referral-code generation — a **separate** trigger, not touching
  `handle_new_user()`).
- `push_tokens.sql` — device token table, own-row RLS only.

### Edge Functions (all read directly)
- `create-payment-session/index.ts` — validates order ownership/product
  match/product active+priced; mints a short-lived `payment_sessions` row.
- `pay/index.ts` — validates session (single-use, atomic claim via
  compare-and-set update), re-derives price from `products`, **snapshots
  product scope fields onto the order** (the key security mechanism, see
  §2), creates the Razorpay order.
- `verify-payment/index.ts` — verifies HMAC signature (or `recover` path
  via Razorpay API lookup), calls `grant_razorpay_payment()`.
- `razorpay-webhook/index.ts` — verifies webhook HMAC (with rotation
  grace via `RAZORPAY_WEBHOOK_PREVIOUS_SECRET`), calls
  `grant_razorpay_payment()` — the authoritative recovery path.
- `send-push-notification/index.ts`, `_shared/{cors,pages,razorpay,
  supabaseAdmin}.ts` — not directly affected by multi-course, but
  `supabaseAdmin.ts`/`_shared` are shared infra to be aware of.
- `mobile-app/supabase/functions/login-with-identifier/index.ts` — a
  second functions folder, noted but not restructured, per ground rules.

### `mobile-app/schena.sql` (reconstructed, see §1)
Full RLS pattern confirmed: `<table>_public_read_active` = `active = true
or am_i_admin()` with **no `auth.uid() is not null` guard**, i.e. literally
open to anonymous read, on `years, subjects, chapters, products, notes,
videos, quiz_tests`. Storage policy `notes_read_if_purchased` joins
`notes → chapters → purchases`, matching by `scope` exactly as documented
in the task brief (chapter/subject/year/bundle via `year_ids @> ARRAY[…]`
using `c.year_id = any(p.year_ids)`).

---

## 7. Planned migration objects (Phase 2 preview — for review, not yet written)

**New tables**
- `public.courses` (id text pk, name, code unique citext/lower-unique,
  description, icon, display_order, active, created_at, updated_at)
- `public.referral_settings` (single-row, id boolean pk default true)
- `public.referrals` (id, referrer_id, referred_id unique, code_used,
  status, reject_reason, timestamps)

**Altered tables** (all via `add column if not exists`)
- `years.course_id text not null references courses(id) on delete restrict`
  (nullable during backfill, `not null` added after)
- `subjects.course_id`, `chapters.course_id`, `notes.course_id`,
  `videos.course_id`, `quiz_tests.course_id`, `products.course_id`
  (denormalized, trigger-enforced)
- `notes.year_id` (denormalized addition per spec, currently absent —
  confirmed: `notes` only has `chapter_id` today)
- `orders.course_id`, `purchases.course_id`
- `profiles.course_id`, `profiles.year_id`, `profiles.referral_code unique`
- `mobile-app/config/database.ts` SQLite `downloads` table:
  `course_id`/`course_title` columns (separate, non-Postgres migration)

**New functions** (`security definer`, `stable` where read-only,
`set search_path = public`)
- `my_course_id()`, `my_year_id()`
- `has_content_access(p_course_id text, p_year_id text)`
- `user_owns_chapter(p_chapter_id text)` (extend existing storage-policy
  logic, now course-aware)
- `set_my_course_year(p_course_id text, p_year_id text)` (RPC for
  profile course/year changes)
- `apply_referral_code(p_code text)`
- Referral code generator trigger function (new trigger on
  `public.profiles`, **not** touching `handle_new_user()`)
- `course_id`/`year_id` consistency-enforcing `before insert or update`
  trigger function(s) on subjects/chapters/notes/videos/quiz_tests/products
  (derive-from-parent-and-raise-on-mismatch pattern)
- `create or replace function public.grant_razorpay_payment(...)` — same
  signature, extended to also handle `course_id` (see §2's recommended
  approach: re-derive from `products`, not `orders`)

**RLS changes**
- New policies on `courses`, `referral_settings`, `referrals`
- Replace (`drop policy if exists` + `create policy`) bodies of
  `<table>_public_read_active` on `subjects/chapters/notes/videos/
  quiz_tests/products` to require `authenticated` + `has_content_access()`;
  `years`/`courses` keep active-only (no auth requirement) for onboarding
- Extend `notes_read_if_purchased` storage policy to also compare
  `purchases.course_id` against the note's chapter's course

**Indexes**: on every new FK, plus `(course_id, active)`/`(year_id, active)`
composite indexes on content tables.

---

## 8. Summary for review

- No proof of an actively exploitable "forged purchase" bug today — the
  `/pay` snapshot step already neutralizes client-tampered order scope
  fields before any money moves. The task's described gap becomes real
  only once `course_id` is introduced without equivalent handling; Phase 2
  will close it defensively (re-derive in `grant_razorpay_payment` from
  `products`, not `orders`).
- Anonymous content read removal is safe from both mobile-app and
  admin-panel's perspective — no code path in this repo relies on it.
- `schena.sql` is unverified; real migrations in `supabase/migrations/`
  were used as the authoritative source wherever they overlap. Live-DB
  verification is still required before Phase 2 lands (see §1).
- `mobile-app/` keeps its own separate git history; commits for it will
  happen in its own repo, not the new outer one.

**Planned migration objects are listed in §7 above.** Awaiting "go" to
proceed to Phase 2.

---

## 9. Phase 2 completion notes (added after implementation)

Delivered: `supabase/migrations/20260919120000_multi_course_and_referrals.sql`
(courses table + seed, denormalized `course_id`/`year_id` + backfill,
consistency/propagation triggers, `has_content_access`/`user_owns_chapter`/
`set_my_course_year`/`apply_referral_code` functions, RLS overhaul on
courses/years/subjects/chapters/notes/videos/quiz_tests/products, storage
policy update, `grant_razorpay_payment` rewrite, and the full referral
system) and `supabase/tests/multi_course_checks.sql`.

**Validation performed**: no Docker/Supabase CLI was available in this
environment (checked — neither `docker` nor `supabase` is installed), but a
local Postgres 17 instance was available. Built a scratch database with
hand-written stubs for the parts of Supabase this SQL depends on
(`auth.uid()`, `auth.users`, `storage.buckets`/`storage.objects`, the
`anon`/`authenticated`/`service_role` roles and their baseline grants),
loaded `schena.sql` + every real migration in chronological order, then
applied the new migration twice (idempotency check) and ran all 10
scenarios from task §11 end to end using `set role authenticated` +
`set_config('request.jwt.claim.sub', ...)` to simulate `auth.uid()`. This
is **not** a substitute for running against a real local Supabase stack
(no GoTrue/PostgREST/Storage API involved), but it did exercise the actual
SQL, RLS, and trigger logic against a real Postgres engine. Findings:

- **Caught and fixed a real bug before it shipped**: the migration
  originally set `profiles.course_id` to `NOT NULL`. `handle_new_user()`
  (the pre-existing `auth.users` → `profiles` trigger, correctly left
  untouched per the ground rules) inserts a bare profile row with no
  `course_id` at all — so every new signup would have started failing
  immediately after this migration landed. Fixed by leaving
  `profiles.course_id`/`year_id` both nullable (existing users were still
  backfilled to `'bams'`; new signups start with both null and go through
  the onboarding gate, exactly as intended for the "new signup" case).
- All 10 §11 scenarios passed: course/year-scoped visibility for two
  different courses, admin sees everything, a new course/year appears
  immediately, a cross-course chapter insert is rejected by the trigger
  with a clear error, a course change nulls out an incompatible year, a
  BHMS student gets 0 rows / `false` for BAMS content and
  `user_owns_chapter`, an existing purchase still unlocks its chapter,
  referral self/invalid/double-apply are all rejected with distinct status
  codes and a valid cross-course referral is recorded and case-insensitive,
  and — the key security case — a tampered order (`scope='year'` on a
  chapter-priced product) still produces a purchase with `scope='chapter'`
  pulled from the *product*, not the order.
- Also verified: a bundle product spanning two courses' years is rejected
  by `products_derive_course()`'s cross-course check; a same-course bundle
  is accepted; moving a year to another course while a bundle references
  it is rejected by `years_before_write()`.
- Confirmed §1 item 6 above (schena.sql vs real-migration policy name
  divergence on orders/purchases) by literally loading both into the same
  database and observing 10 distinct policy names covering what should be
  4-5 access rules.

No other issues found. The migration is believed correct and safe to
apply to a real local/staging Supabase project for final confirmation
before production.
