# Phase 1 — Apply and verify, in two steps (REVIEW ONLY: nothing here has touched production)

| | What | Risk to students | Fixes |
|---|---|---|---|
| **1A** | `supabase/migrations/20260922100000_phase1a_sync_and_order_security.sql` | none found for released builds (see `OLD_BUILD_COMPATIBILITY.md`) | orders / payment RPC / profile holes; folds in the 7 never-applied migrations; keeps `delete_my_account()` as a wrapper; **does not touch storage** |
| **1B** | notes bucket private + drop legacy public-read policy + free-preview rule, **one migration, drafted after 1A is verified** | breaks builds that open notes by public URL (versionCode 1, maybe 2) | the last critical hole (note PDFs readable by anyone) |

**Until 1B ships, the note PDFs remain readable through the legacy policy. Keep the gap short.**
The 1B SQL is deliberately **not** in `supabase/migrations/` yet, so no `supabase db push` can apply it by accident.

## 0. Blocking items — I still need these from you

Your last message again contained placeholders instead of values. I have not assumed any of them.

- **Backup:** real date/time, or "not done yet". Nothing is applied until this is a real timestamp **and** `BACKUP_GUIDE.md` §7 (restore test) passed.
- **Bucket flags:** `notes` = Public or Private? `thumbnails` = ? If `notes` is **Public**, everyone holding a note link could always download it; 1A does not change that, 1B does.
- **Play Console numbers:** active installs by versionCode (especially 1 and 2). Decides when 1B is safe.
- **Deployed Edge Function check** (`OLD_BUILD_COMPATIBILITY.md` §4).

## What I tested (and what I could not)

Scratch Postgres 17 restored from `docs/live-schema/live_schema.sql`, seeded like production, then 1A applied:
- All three exploits worked before; all are blocked after.
- `phase1a_security_checks.sql` 36/36 · `phase1a_old_build_compat.sql` 18/18 · existing suites: multi_course 13/13, null_year 7/7, app_config 5/5, analytics_retention 6/6, account_deletion 9/9.
- What a released-build student can read is **identical before and after** (row counts per table); bucket flags and storage policies unchanged; orders/purchases/payments/profiles/auth.users counts unchanged; second run is a no-op.
- Two defects found and fixed during this testing: my first order guard blocked account-deletion cleanup (fixed with a transaction-local flag set only by `delete_my_account()`), and one of my checks was too strict for the deployed function versions (now checks only that a checkout session exists for the order's product).
Not tested: real production data volume/shape, the real Razorpay round trip, the app on a device, the deployed Edge Function source, the bucket flags.

---

# PART 1A

## 1A.0 When to apply (lowest-traffic window)

I have no traffic data, so I cannot name the hour from evidence. Run `docs/phase1/queries/traffic_by_hour.sql` and pick the quietest hour. My recommendation until you have the numbers: **a Tuesday–Thursday, 03:00–05:00 IST slot** (medical students study evenings and weekends; the middle of a weeknight night is the usual low point; avoid Mondays, weekends, and exam weeks). 1A needs no downtime: the migration runs in one transaction with brief table locks, expected well under a minute. Do not apply while a payment is in progress: run `queries/inflight_payments.sql` 5 minutes before and again just before you run the migration; it must return 0 rows.

## 1A.1 Pre-flight (all read-only)
1. Backup done and verified (`BACKUP_GUIDE.md`), real timestamp recorded. Latest Supabase backup/PITR point noted.
2. `docs/phase1/inspect_flagged_orders.sql` run; both orders checked in Razorpay (Captured / amount / productId).
3. Deployed Edge Functions downloaded and diffed (`OLD_BUILD_COMPATIBILITY.md` §4).
4. `abuse_detection.sql` re-run; still only the 2 known A8 rows.
5. Traffic hour chosen; `inflight_payments.sql` = 0 rows.
6. Git working tree committed, so you can prove exactly what was applied.

## 1A.2 Apply
```bash
supabase link --project-ref <project-ref>           # already linked
supabase migration list                             # read the Local vs Remote columns
```
Local-only rows should be the seven folded files plus `20260922100000`. `orders_purchases_rls.sql` / `push_tokens.sql` have no timestamp and are skipped. If any *other* file is local-only (for example `20260801_auth_verified_identities.sql`), send me the output first.
```bash
supabase migration repair --status applied \
  20260919120000 20260919130000 20260920120000 20260920130000 \
  20260920140000 20260921120000 20260921130000     # folded into 1A, must not run twice
supabase migration list                             # now ONLY 20260922100000 is local-only
supabase db push --dry-run                          # must list ONLY 20260922100000
supabase db push
```
Expected output ends with `NOTICE: Phase 1A migration self-checks passed.` If anything errors, the transaction rolled back and production is unchanged: send me the message. Do **not** redeploy any Edge Function or ship any app build as part of 1A.

## 1A.3 Verify on live (this order; stop at the first failure and use §1A.4)
1. `psql "$DB_URL" -f supabase/tests/phase1a_security_checks.sql` → last line `0 FAIL, 36 PASS`.
2. `psql "$DB_URL" -f supabase/tests/phase1a_old_build_compat.sql` → `0 FAIL, 18 PASS`. (Both run in a rolled-back transaction and create only `ph1_*` / `oc_*` fixtures.)
3. Counts equal the Phase 0 baseline: `profiles`, `orders_*`, `purchases`, `payments`, `products`, `auth.users`, `storage_notes`. New rows only in `courses` (5), `referral_settings` (1, disabled), `app_config` (2).
4. Bucket flags identical to what you recorded (1A must not have changed them). The legacy policy still exists: `select policyname from pg_policies where policyname = 'public read notes/thumbnails';` → 1 row.
5. `select has_function_privilege('anon','public.grant_razorpay_payment(text,text,text,bigint)','execute'), has_function_privilege('authenticated','public.grant_razorpay_payment(text,text,text,bigint)','execute');` → `false, false`.
6. **Attack replays with a test student's token** (never an admin):
   ```bash
   curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/grant_razorpay_payment" -H "apikey: $ANON" -H "Authorization: Bearer $STUDENT_JWT" \
     -H 'Content-Type: application/json' -d '{"p_event_id":"x","p_razorpay_order_id":"x","p_razorpay_payment_id":"x","p_amount_paise":100}'   # permission denied
   curl -s -X PATCH "$SUPABASE_URL/rest/v1/orders?id=eq.<test-order>" -H "apikey: $ANON" -H "Authorization: Bearer $STUDENT_JWT" \
     -H 'Content-Type: application/json' -d '{"product_id":"<other-product>"}'                                                                     # "Orders cannot be edited"
   curl -s -X PATCH "$SUPABASE_URL/rest/v1/profiles?id=eq.<test-student-id>" -H "apikey: $ANON" -H "Authorization: Bearer $STUDENT_JWT" \
     -H 'Content-Type: application/json' -d '{"blocked":false}'                                                                                      # "Cannot modify protected profile fields"
   ```
7. **The released Play Store build, on a real phone, logged in as an existing student** (this is the check a database test cannot replace): browse Years → Subjects → Chapters, open a purchased PDF, open the free first PDF of an unpurchased chapter, open Profile and save the name, start and cancel a checkout (order ends `failed`, no error), read My Purchases.
8. **One real purchase** (cheapest product, real ₹, then refund it in Razorpay): order `paid`, one purchase, PDF opens, and pressing Back mid-payment on a second attempt leaves that order `failed` with no crash.
9. Admin panel: Courses, Referrals, Orders, Notes load; upload and preview a PDF.
10. `abuse_detection.sql` again: only the 2 known rows (or none after repair).
11. Watch **Dashboard → Edge Functions → Logs** for `razorpay-webhook` and `verify-payment` for 24 h. `has no completed checkout session` or `does not match its checkout session` means a real payment was refused: use rollback **R2** and tell me immediately (the money is captured at Razorpay).
12. When 1–7 pass: run `docs/phase1/repair_clobbered_orders.sql` (its SELECT first) for the two orders.

## 1A.4 Rollback plan

| Situation | Action | Data impact |
|---|---|---|
| `db push` fails | Nothing to do; the transaction rolled back. | none |
| A real payment is not unlocking (log: `no completed checkout session` / `does not match`) | `docs/phase1/rollback/1A_targeted_rollback.sql` **R2** (highlight and run only that block). Tested on the scratch DB. | none |
| Students cannot start a purchase / order errors | **R1** (disables only the orders guard trigger; re-enable after the fix). | none; reopens the order-swap hole meanwhile |
| API says a table/column is missing right after the push | **R3** (`notify pgrst, 'reload schema'`). | none |
| A screen is broken for existing students in a way no targeted script fixes | Ask me first: the folded course/year policies can be adjusted without a restore. | none |
| Data corruption or an unexplained mass failure | **Full restore from the Phase 0 backup**, see below. Last resort. | loses everything written after the backup point |

**Full restore, honestly:** there is no down-migration. Use whichever you have:
1. **PITR (Pro plan + add-on):** Dashboard → Database → Backups → *Point in Time* → choose the second before `db push`. This rolls the *whole* database back, so every order/payment/signup made since is lost from the database. Before restoring, export the new `orders`, `payments`, `purchases`, `profiles` rows (`\copy … to csv`) and reconcile paid ones against Razorpay afterwards.
2. **Daily backup (Pro):** same screen, *Restore* on the newest daily backup. Loses up to 24 h, so use only if PITR is unavailable.
3. **Your Phase 0 dump (any plan):** restore `full.dump` into a **new** Supabase project, verify it, then repoint the app/admin/Edge Functions to the new URL and keys. That needs an app release, so it is a disaster-recovery path, not a quick undo. It does **not** restore Storage files: restore them from your Phase 0 `storage/` copy.
Every one of these also brings back the original security holes. Prefer the targeted scripts.

## 1A.5 After 1A: release the new app build (separate from the database)
Ship 1.1.0 (`app.json` version bumped, `app_open` event, force-update gate) as a **staged Play rollout**. Then measure adoption weekly with `queries/build_adoption.sql` and Play Console. Notify older builds by push + in-app notification.

---

# PART 1B (plan; the SQL will be written and tested on the scratch DB after 1A is live and verified)

## 1B.0 Gate — all must be true before 1B is applied
1. 1A live and verified for at least a few days, no open payment issues.
2. **Old-build exposure is acceptable.** Builds using raw public URLs are only versionCode 1 and (possibly) 2. **versionCode ≥ 3 (the July build and later) already works with a private bucket**, so the new 1.1.0 build is *not* technically required for 1B; it is required if Play Console shows a meaningful number of installs on versionCode 1 or 2. Your rule (new build live first) stands; the numeric threshold is yours to set. My suggestion: proceed when Play Console shows **< 1 %** of active installs on versionCode ≤ 2 **and** the logged `GET /object/public/notes/` count in `old_builds_from_logs.md` has been ≈ 0 for 7 days.
3. Announcement sent to older builds (push + in-app + support email) at least a week earlier.
4. Fresh backup taken again (`BACKUP_GUIDE.md`), because Storage changes are not covered by PITR.

## 1B.1 What the migration will contain
- `update storage.buckets set public = false where id = 'notes'` (thumbnails stay public).
- `drop policy "public read notes/thumbnails"` (thumbnails stay covered by `public read thumbnails`, added in 1A).
- **Free preview rule on the server:** `notes.is_free_preview boolean not null default false` (settable in the admin panel), a storage policy `notes_free_preview_read` that lets any signed-in user read an object referenced by an active note with `is_free_preview = true`, and a backfill that flags **exactly the note the released app already treats as free** (the first active note of each chapter by the app's own sort: `order` ascending, sorted on the phone). That keeps versionCode 3 and 1.1.0 working with no app change, and lets admins add or remove free previews afterwards. Caveat: the app sorts on the phone and the query has no tie-break, so in any chapter where two notes share the same `order` value the "first" one is not well defined today; I will list those chapters before 1B so you can fix their order in the admin panel. Admin panel toggle + `noteService` + type updates ship with it.
- Self-checks in the migration (bucket private, legacy policy gone, free rule present, counts unchanged) and `supabase/tests/phase1b_security_checks.sql` (non-buyer cannot read a paid PDF, non-buyer can read a flagged preview, buyer can read all, anon cannot read either, thumbnails still public).
- The multi-course tests' storage-isolation assertions (relaxed in 1A) become strict again.

## 1B.2 Apply / verify / rollback (outline)
Apply in the same quiet window as 1A, with the same in-flight-payments check. Verify: logged-out request to a public note URL fails; a non-buyer opens the free preview and is refused a paid PDF; a buyer opens every PDF; downloads work; admin preview works; watch `sign` vs `public` request logs and support inbox for 24 h.
Rollback for 1B, in order of preference: (1) fix the specific note by setting `is_free_preview`; (2) recreate the legacy policy `"public read notes/thumbnails"` — restores the pre-1B behaviour for signed-URL clients (v3+) but re-exposes every PDF to any signed-in user; (3) only if builds on public URLs are the problem, set the bucket public again (re-exposes everything to anyone with a link). Options 2 and 3 undo the security fix, so use them only for a short, deliberate window.
