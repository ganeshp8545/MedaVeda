# MedVeda security fixes (audit round 1)

Migrations are `supabase/migrations/20260924*.sql` (new files; no old migration was edited).
Nothing here touches the referral system. No order / purchase / payment / profile row is deleted or rewritten
(each money migration asserts unchanged row counts and rolls back otherwise).

| Issue | Migration | Edge Function / client |
|---|---|---|
| Critical 1 | `20260924100000_critical1_lock_settlement_functions` | `verify-payment`, `razorpay-webhook`, `_shared/settle.ts` |
| Critical 2 | `20260924110000_critical2_orders_server_only` | `create-order` (new), `pay` + `create-payment-session` **deleted** |
| Critical 3 | `20260924120000_critical3_storage_profiles_rls` | `get-note-url` (new) |
| High 4 | `20260924130000_signup_name_phone_and_backfill` | – |
| High 5 | `20260924140000_auth_rate_limits` | `login-with-mobile`, `request-password-reset-by-mobile` |
| Medium 6 | `20260924150000_free_preview` | `get-note-url`, `get-video-url`, admin panel checkbox |

## 1. What changed

### Critical 1 – free purchase via direct RPC
* Root cause: Supabase grants EXECUTE on new functions to `anon`/`authenticated` directly, so `revoke … from public` never removed it. Phase 1A already locked `grant_razorpay_payment`; this migration makes it systematic.
* A `DO` block finds **every** SECURITY DEFINER function in `public` whose body inserts/updates `purchases`/`payments`/`entitlements`, sets an order `paid`, or is named grant/settle/unlock/entitle, and sets `revoke all … from public, anon, authenticated; grant execute … to service_role`. It prints the list as `NOTICE`s – **read them in the `db push` output**.
* Defence in depth: table privileges for INSERT/UPDATE/DELETE on `purchases`, `payments`, `payment_sessions`, `razorpay_webhook_events` revoked from clients; every non-SELECT policy on them dropped; a `BEFORE` trigger (`block_client_writes`) rejects writes from the `anon`/`authenticated` roles (the only bypass is the flag set inside `delete_my_account()`, so account deletion still works).
* `alter default privileges … revoke execute on functions from anon, authenticated`: **future** functions are not client-callable unless the migration grants them.
* Idempotency: unique indexes on `payments(razorpay_payment_id)`, `purchases(order_id)`, `orders(razorpay_order_id)` (all already existed; re-asserted).
* Settlement code (`_shared/settle.ts`, used by BOTH `verify-payment` and `razorpay-webhook`):
  1. (verify-payment) HMAC-SHA256(`order_id|payment_id`, KEY_SECRET), constant-time compare of decoded digests, and `order_id` must equal the one stored on our order;
  2. `GET /payments/{id}` from Razorpay: `status = captured`, `order_id` matches, `currency = INR`, `amount` = our order amount in paise;
  3. `GET /orders/{id}`: amount/currency again;
  4. `grant_razorpay_payment()` (service role only): row-locks the order, re-checks the amount, one payment id ↔ one order, upserts payment + purchase, marks order paid.
* Webhook: raw-body HMAC (constant time, already present) → `payment.captured` only → same `settleCapturedPayment`. Unknown/mismatching payments are acknowledged (204) and logged so Razorpay stops retrying; transient failures return 500 so it retries.

### Critical 2 – order rewriting
* Client INSERT/UPDATE/DELETE policies **and privileges** on `orders` removed (this includes the admin "update all orders" policy). Clients keep SELECT (own orders; admins all).
* `create-order` is the only creator: receives **only `productId`**, reads price/scope/course from `products`, creates the Razorpay order for that amount, and inserts `product_id + amount + razorpay_order_id` in one insert.
* `orders_01_immutable_columns` trigger: `amount`, `razorpay_order_id` can never change; `user_id`/`product_id` can only go to NULL (account deletion / product deletion via FK `ON DELETE SET NULL` – blocking that would break both). Applies to every role including service_role.
* `grant_razorpay_payment` now grants **the product stored on the order row** (its old requirement for a `payment_sessions` row is dropped because that flow is retired) and compares the Razorpay amount to the order.
* New `admin_set_order_status(id, 'cancelled'|'failed')` RPC replaces the admin panel's direct UPDATE; it can never set `paid` or touch a settled order. `admin-panel/src/services/orderService.ts` calls it.

### Critical 3 – other holes
* `notes` bucket: `public = false`; every non-admin policy that mentions the bucket dropped (`public read notes/thumbnails`, `notes_read_if_purchased`, …). Admin read/write policy kept. `thumbnails` stays public. Migration warns (`RAISE WARNING`) about any storage policy with **no bucket filter**, which would still expose notes – check the output.
* Signed URLs only from `get-note-url` (120 s TTL). Mobile `getSecureNoteUrl(noteId)` now calls it.
* `profiles`: trigger rewritten. A client (anon/authenticated role, not admin, not the `set_my_course_year` RPC) cannot change `blocked`, `is_blocked`, `role`, `is_admin`, `is_staff`, `status`, `email_verified`, `mobile_verified`, `referral_code`, `course_id`, `year_id`, `id`, `created_at` (checked through `to_jsonb`, so it also covers columns that exist only in some environments). A client-inserted profile is forced unblocked/unverified. Your schema has `blocked` (no `is_blocked`/`role` column; admins live in `admins`).
* "Students can't set order/purchase paid": closed by the two migrations above (no policy, no privilege, plus triggers).

### High 4 – signup name/phone
`handle_new_user` = `coalesce(full_name, name)` and `normalize_phone(coalesce(mobile_number, phone))`. One-time backfill fills only blank `name`/`phone`, never overwrites, skips a phone that is malformed or already owned by another profile (or claimed by an older account), verifies the profile row count is unchanged. Needs `normalize_phone()` / `profiles.phone_normalized`, which exist on live but in **no repo migration** – the migration fails early with a clear message if they are missing (staging/local).

### High 5 – login-with-mobile / request-password-reset-by-mobile
They **are in the repo** (`supabase/functions/`), so the "missing" report is probably about the *deployed* state. Check:
```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase functions list                       # are both listed and ACTIVE?
# Compare the deployed code with the repo (download into a scratch copy, don't overwrite):
git stash -u   # or work on a clean checkout
supabase functions download login-with-mobile
supabase functions download request-password-reset-by-mobile
git diff supabase/functions                   # empty = deployed == repo
git checkout supabase/functions               # discard the download
```
If they are not deployed: `supabase functions deploy login-with-mobile request-password-reset-by-mobile --no-verify-jwt`
(also set in `config.toml`; the app calls them before there is a session).
Hardening added: DB-backed rate limits (login: 20/10 min per IP, 5/10 min per number; reset: 10/h per IP, 3/h per number), counted before any lookup and independent of whether the number exists; login returns the same generic 401 for unknown/blocked/wrong-password/unconfirmed and a decoy sign-in equalises timing; reset always returns `{ ok: true }` (also when rate-limited) and sends the email in the background; the email/profile is never returned. Trade-off: 5 attempts/10 min per number lets someone temporarily lock a victim out of *mobile* login (email login is unaffected).

### Medium 6 – free preview
* `is_free_preview boolean` on `notes` and `videos`; backfill flags the first note of each chapter and the first video of each **subject** (videos have no `chapter_id` – they are scoped to a subject, like quizzes). Admin panel has a "Free preview" checkbox in the note and video forms.
* `get-note-url` allows a preview note for any signed-in, non-blocked user; otherwise requires a purchase covering the chapter (chapter/subject/year/bundle scope, same rule as `user_owns_chapter`). Mobile `NotesScreen` uses the server flag.
* `get-video-url` + `user_can_access_video` implement the same model for videos. **Decision for you:** today videos are free for everyone (RLS lets any student of the course read `videos.youtube_url`, and the app text says "Videos & Quiz are always free"). Making them paid means hiding `youtube_url` from `select *` (column privilege) and switching the app's video screens to `get-video-url` – it would remove free access that current users have, so I did **not** flip it. The function and entitlement rule are ready; tell me when to do the rollout. Quizzes remain free.

## 2. Breaking change for already-released app builds
Old builds insert orders from the phone and read PDFs through the storage policy. After the migrations they get "permission denied" on Buy and "note isn't available". This is inherent in the requested design. **Ship the new mobile build first, raise the minimum supported version (`app_config`), then apply migrations 2 and 3** (1, 4, 5, 6 are safe at any time; migration 1 is invisible to correct clients).

## 3. Policies after the changes
Live output is what counts – run `docs/security/rls_policy_report.sql` after deploying and review it. Expected state for the tables touched (derived from the migrations, not from a live DB – I had no database to run against):

| Table | Policies (all `to authenticated` unless noted) |
|---|---|
| orders | SELECT own (`auth.uid() = user_id`); SELECT admin (`am_i_admin()`). **No INSERT/UPDATE/DELETE.** |
| purchases | SELECT own; SELECT admin. No writes. |
| payments | SELECT own. No writes. |
| payment_sessions, razorpay_webhook_events, rate_limits | RLS on, **no policies** (service role only) |
| profiles | SELECT (existing); UPDATE `profiles_update_own` (`id = auth.uid()`), protected columns enforced by trigger; INSERT per earlier migrations, trigger forces unblocked/unverified |
| notes, videos, quiz_tests, chapters, subjects | SELECT `*_public_read_active` (active + `has_content_access`); `*_admin_write` (ALL, admin) — from 20260919120000, unchanged |
| products | `products_public_read_active` SELECT; `products_admin_write` ALL admin — unchanged |
| storage.objects | `notes_admin_write` (ALL, admin, bucket `notes`); `public read thumbnails` (SELECT, bucket `thumbnails`). **No client policy on `notes`.** |

## 4. Test checklist (as a normal student, staging first)
Automated: `psql "$DB_URL" -f supabase/tests/critical_fixes_checks.sql` (rolled-back attack simulation; **not executed by me** – no database available here). Manual, using the student's access token (`$TOKEN`) and anon key (`$ANON`):

| # | Attack | Command | Must be |
|---|---|---|---|
| 1 | Direct RPC | `curl -X POST $URL/rest/v1/rpc/grant_razorpay_payment -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"p_event_id":"e","p_razorpay_order_id":"order_x","p_razorpay_payment_id":"pay_x","p_amount_paise":4900}'` | 401/403 "permission denied" |
| 1b | Other RPCs | run the "SECURITY DEFINER functions callable by clients" query in `rls_policy_report.sql`; none may grant access | only `am_i_admin`, `set_my_course_year`, `delete_my_account`, `apply_referral_code`, `get_my_referrals`, `admin_set_order_status` (admin-checked) etc. |
| 2 | Fake paid order | `curl -X POST $URL/rest/v1/orders … -d '{"id":"x","user_id":"<me>","product_id":"<p>","scope":"chapter","amount":0,"status":"paid"}'` | 401/403 permission denied |
| 3 | Order product/price change | buy the ₹49 product → stop at checkout → `PATCH /rest/v1/orders?id=eq.<id>` with `{"product_id":"<₹1999>","amount":1}` | 403 permission denied; DB row unchanged |
| 4 | Fake purchase | `POST /rest/v1/purchases` with any body | 403 |
| 5 | Self-unblock | `PATCH /rest/v1/profiles?id=eq.<me>` `{"blocked":false}` (as a blocked user), also `email_verified`, `course_id`, `referral_code` | error "protected profile field" |
| 6 | Public bucket URL | `curl -I $URL/storage/v1/object/public/notes/<path>` (no auth) and `…/authenticated/notes/<path>` with `$TOKEN` | 400/404 (bucket not public); 400/403 |
| 7 | Client-side signed URL | `POST /storage/v1/object/sign/notes/<path>` with `$TOKEN` | denied |
| 8 | Locked note via function | `POST $URL/functions/v1/get-note-url {"noteId":"<paid, non-preview note>"}` without a purchase | 403 |
| 9 | Client-supplied price to create-order | `POST /functions/v1/create-order {"productId":"<₹49>","amount":1}` | order created at the DB price ₹49; the `amount` field is ignored |
| 10 | Forged verify | `POST /functions/v1/verify-payment` with a random signature | 400 "verification failed"; no purchase |
| 11 | Wrong-amount payment | pay ₹49 for order A, then call verify with A's payment id but order B's id | 400, no purchase |
| 12 | Replay | send the same valid verify request twice | second is `success` but no second purchase/payment row |
| 13 | Webhook | POST unsigned body to `razorpay-webhook` | 401; with a valid signature: 204 and one purchase |
| 14 | Rate limits | 6 wrong logins for one number in 10 min | 429 on the 6th; unknown number gives the same 401/429 as a known one |

Must work: **genuine ₹49 purchase** (Buy → Razorpay → success screen → `purchases` row with `amount 49` → note opens via signed URL → `payments` row exists, order `paid`); **free preview** (first note of a chapter opens for a student with no purchase; second note → "Locked"; a student who bought the chapter opens both); signup with name + phone shows both in `profiles`; login with mobile works; kill the app right after paying and reopen → recovery grants the purchase (or the webhook does).

## 5. Deploy steps
```bash
supabase link --project-ref <PROJECT_REF>

# 0. Backup first (Dashboard → Database → Backups, or pg_dump). Then read the
#    suspicious-purchases report (docs/security/suspicious_purchases.sql) BEFORE changing anything.

# 1. Secrets (already needed by the existing functions – confirm with `supabase secrets list`)
supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxx RAZORPAY_KEY_SECRET=xxx RAZORPAY_WEBHOOK_SECRET=xxx
#    (ALLOW_TEST_MODE=true only on staging with rzp_test_ keys). SUPABASE_URL,
#    SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

# 2. Migrations. `db push` applies everything pending, in order, so do it once the new app build is
#    live (see section 2). To split it, push with only 20260924100000/130000/140000/150000 present
#    and add 110000/120000 later.
supabase db push          # applies 20260924100000 … 20260924150000 in order
#    Read the output: NOTICE lines list every function that was locked; WARNING lines list
#    storage policies with no bucket filter that need a manual look.

# 3. Functions (new + changed)
supabase functions deploy create-order get-note-url get-video-url verify-payment razorpay-webhook \
  login-with-mobile request-password-reset-by-mobile
#    razorpay-webhook, verify-payment and the two login functions run with verify_jwt=false (config.toml).

# 4. Retire the old flow (after the new mobile build is out)
supabase functions delete pay
supabase functions delete create-payment-session

# 5. Razorpay Dashboard → Webhooks: URL https://<ref>.supabase.co/functions/v1/razorpay-webhook,
#    event payment.captured ONLY, secret = RAZORPAY_WEBHOOK_SECRET.

# 6. Ship the mobile build (create-order + get-note-url) and the admin panel (free-preview checkbox,
#    order status RPC). Admin previews of PDFs that use getPublicUrl() will stop resolving now that the
#    bucket is private - use getSignedUrl() from admin-panel/src/services/storageService.ts.

# 7. Verify: run docs/security/rls_policy_report.sql, then the checklist above.
```
Rollback: migrations are additive; to reopen a path temporarily, re-grant/`create policy` in a new migration (never edit these). Set the notes bucket back to public only as an emergency measure.

## 6. Things I could not verify
No Postgres/Supabase instance was available in this environment, so **none of the SQL or Edge Functions has been executed** (mobile and admin TypeScript type-check clean). Run everything on a staging copy of production first. The suspicious-purchases query can only prove absence of a *verified* payment row in our DB; confirm flagged rows against your Razorpay dashboard export before revoking anything.
