# Deploy order (audit fixes + referral, Sept 2026)

`supabase db push` applies EVERY pending migration, and the CLI refuses to push one that is older than
one already applied. Migrations first, then functions, then the admin panel, then the mobile app.
**Batch 2 (paid videos) is held: see `supabase/held/batch2-videos/README.md`; it is not in
`supabase/migrations/` on purpose (its file name is a far-future placeholder).**

## State of live when this was written (2026-09-21, from `supabase migration list --linked`)
* Applied: everything up to and including `20260927100000` (Stages 1 and 2 below).
* NOT applied: `20260927110000` `120000` `130000` `20260928100000` `20260928110000` (Stages 3 to 7).
* **`referral_settings.enabled` is `true` on live right now**, and Batch 3 / 3b (referral hardening and
  anti-farming) are not applied yet. Referral is therefore running without them. Either deploy Stages 4 and 5
  before anyone can farm it, or switch the program off in the admin panel until they are live.
  (`require_verified_phone` does not exist yet on live; it defaults to false when Stage 4 adds it.)

## Staging: `db push` cannot pick files
All stage files are now in `supabase/migrations/`, so a plain `supabase db push` would apply every pending stage at
once (in the right order, but with no chance to verify between stages). To deploy ONE stage: move the later stages'
files out (`mkdir -p /tmp/pending && mv supabase/migrations/<later files> /tmp/pending/`), run
`supabase db push --dry-run` and confirm it lists only that stage, push, verify, then move the files back.

| Stage | Migration | Functions / builds | Needs first |
|---|---|---|---|
| 1. Batch 1 (money paths + hygiene) - APPLIED | `20260926100000` `110000` `120000` `130000` | `razorpay-webhook`, `create-order` | Razorpay: subscribe the webhook to `payment.dispute.created / .under_review / .action_required / .won / .lost / .closed`; confirm the API key can read disputes |
| 2. F7 (drop `is_admin()`) - APPLIED | `20260927100000` | - | - |
| 3. F8 (revoke excess grants) | `20260927110000` | - | - |
| 4. Batch 3 (referral hardening) | `20260927120000` | - | - |
| 5. Batch 3b (anti-farming) | `20260927130000` | - | Stage 4 |
| 6. Referral limits + audit | `20260928100000` | - | - (independent of 4/5, but deploy after them) |
| 7. Referral off blocks wallet | `20260928110000` | - | **Stage 5** (re-issues its `create_priced_order` / `quote_my_order`; it refuses to run without it) |
| 8. Admin panel build | - | `cd admin-panel && npm run build`, publish `dist/` | Stage 6 (the change log needs the audit table; the form itself still works without it) |
| 9. Mobile build | - | EAS build / Play release | Stage 7 for the full behaviour (see below) |

Stage 9 does not need a minimum-version gate: an old build keeps working (it only shows a wallet toggle that the
server, after Stage 7, quotes as unavailable while the program is off).

## Verify after each stage (read-only: `supabase db query --linked "..."`)
1. Stage 1: `select to_regprocedure('public.handle_payment_dispute(text,text)') is not null, (select count(*) from purchases where status is null), to_regclass('public.purchases_one_success_per_product') is not null;`
   -> `t | 0 | t`. End to end: buy a Rs 1 test product with a non-admin test account, refund it fully in Razorpay:
   the purchase must become `refunded` and the note/video must lock. A partial refund must change nothing.
2. Stage 2: `select to_regprocedure('public.is_admin()') is null;` -> `t`; log in to the admin panel and save a setting (App Settings page).
3. Stage 3 (F8):
   `select count(*) from pg_class c where relnamespace='public'::regnamespace and relkind='r' and has_table_privilege('authenticated', c.oid, 'TRUNCATE');` -> `0`
   `select count(*) from pg_class c where relnamespace='public'::regnamespace and relkind='r' and relname <> 'analytics_events' and (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'));` -> `0`
   App still logs pre-login events; the admin panel still edits content.
4. Stage 4 (Batch 3):
   `select column_default from information_schema.columns where table_name='referral_settings' and column_name='require_verified_phone';` -> `false`
   `select count(*) from pg_policies where tablename='referrals' and policyname='referrals_read_own';` -> `0` (students read referrals through the RPCs only)
   `select exists(select 1 from pg_constraint where conname='profiles_referral_code_upper');` -> `t`
   In the app: Refer & Earn still lists referrals (RPC); the admin Referrals page still lists them.
5. Stage 5 (Batch 3b):
   `select to_regclass('public.first_purchase_identities') is not null, to_regprocedure('public.has_prior_purchase_identity(uuid)') is not null, has_table_privilege('authenticated','public.first_purchase_identities','SELECT');` -> `t | t | f`
   `select (select count(*) from first_purchase_identities), (select count(distinct user_id) from purchases where status='success');` -> first number = second x (1 or 2) (hashes of email and/or phone per buyer)
6. Stage 6 (limits + audit):
   `select (select count(*) from pg_constraint where conrelid='public.referral_settings'::regclass and conname like 'referral\_settings\_%\_range'), (select relrowsecurity from pg_class where oid='public.referral_settings_audit'::regclass), has_table_privilege('authenticated','public.referral_settings_audit','INSERT'), exists(select 1 from pg_trigger where tgname='referral_settings_audit_trg');` -> `7 | t | f | t`
   The CHECK really bites (must ERROR, changes nothing): `update public.referral_settings set wallet_max_percent = 0 where id = true;`
   -> `violates check constraint "referral_settings_wallet_max_percent_range"`.
   After the first real save in the admin panel: `select changed_by_email, old_values, new_values from public.referral_settings_audit order by id desc limit 1;` -> your admin email and only the changed columns.
7. Stage 7 (referral off blocks wallet):
   `select (select prosrc like '%p_use_wallet and v_set.enabled%' from pg_proc where proname='create_priced_order'), (select prosrc like '%v_set.enabled and v_product.product_type%' from pg_proc where proname='quote_my_order');` -> `t | t`
   Behaviour (uses a test account that has a wallet balance; switch the program off, then back on):
   in the app open Order Summary on a notes product -> no "use referral balance" toggle while off, toggle back when on;
   the Referral screen still shows the balance while off.
8. Stage 8 (admin panel): open Referrals -> the form shows the saved numbers (no defaults flash); type wallet 0 or discount 60 ->
   red message under the field and Save disabled; wallet 70 -> confirmation dialog with the Rs 499 example -> Save anyway ->
   "Recent changes" shows the new entry at the top (matches the Stage 6 audit query).
9. Stage 9 (mobile): Referral screen, Order Summary and Referral terms show the numbers currently saved in the admin panel
   (change one in the admin panel, reopen the screen: it updates with no app restart); program off -> no Refer & Earn entry in
   Profile and no wallet toggle at checkout.

## Before referral is (re-)enabled / while it is on
* Decide `require_verified_phone` (no phone-verification flow exists; 0 of 22 profiles are verified; the switch exists after Stage 4).
* The admin panel has NO screen for `order_review_flags` (discount_reused, duplicate_purchase,
  referral_shared_network, ...). Until one exists: `select * from order_review_flags where resolved_at is null;`
* `first_purchase_identities` stores hashes of buyers' email / phone after deletion - mention it in the privacy policy.
* F8 default-privileges caveat: `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` is expected to be denied on hosted Supabase (NOTICE only).
* Orders created while the program was on keep the wallet amount they were priced with, even if the program is switched
  off before the student pays (Razorpay was already asked for that exact amount). New orders and quotes get no wallet.

## Tests
`supabase/tests/*.sql` (psql, each rolled back; newer ones end with "N FAIL, M PASS"): `f7_checks`, `f8_checks`,
`batch1_checks`, `batch3_checks`, `batch3b_checks`, `referral_limits_checks`, `referral_off_wallet_checks`,
`phase2_referral_wallet_checks`. Also `batch3_race.sh`, `batch3b_backfill.sh`, `webhook-harness/run.sh`,
`delete-account-harness/`. Build the scratch database from the migrations in order (see the memory / README of each).
