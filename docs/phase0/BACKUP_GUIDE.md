# Phase 0 — Backup and abuse check (do this before ANY production change)

Nothing in this guide changes production. Every command below only reads.
**I will not write or apply any production migration until you tell me the backup is done and verified.**

Never paste passwords, service-role keys or connection strings into chat or commit them. Keep them in your shell only.

---

## 1. Get what you need

- Supabase Dashboard → Project Settings → **Database** → *Connection string*. Use the **Session pooler** URI (port 5432). The direct connection needs IPv6 and often fails on home networks.
- Install: Supabase CLI, and PostgreSQL client tools of **version 17** (`pg_dump --version` must be 17 or newer; production is 17.6).

```bash
export DB_URL='postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres'
mkdir -p ~/medveda-backup-$(date +%F) && cd ~/medveda-backup-$(date +%F)
```

## 2. Check what Supabase already keeps (write down the result)

Dashboard → **Database → Backups**.
- Pro plan or higher: note the timestamp of the latest daily backup. If **PITR** is enabled, note the earliest restore point. This is your fastest rollback but do **not** rely on it alone (it does not include Storage file contents).
- Free plan: there is no dashboard backup. The manual dumps below are your only backup.

## 3. Database dumps (three files + one full dump)

```bash
# roles (custom roles only)
supabase db dump --db-url "$DB_URL" --role-only -f roles.sql

# schema (all app schemas: public, plus policies, functions, triggers)
supabase db dump --db-url "$DB_URL" -f schema.sql

# data of the app schema
supabase db dump --db-url "$DB_URL" --data-only --use-copy -f data_public.sql

# users, identities, and Storage metadata (buckets, object rows) — needed to restore logins and file listings
supabase db dump --db-url "$DB_URL" --data-only --use-copy -s auth,storage -f data_auth_storage.sql

# one full custom-format dump of everything you have permission to read (most convenient to restore from)
pg_dump "$DB_URL" -Fc --no-owner --no-privileges -f full.dump
```

If `-s auth,storage` is rejected by your CLI version, run `supabase db dump --help` and use the schema flag it shows, or rely on `full.dump`.

## 4. Storage files (the DB dump does NOT contain the PDFs)

Option A — Supabase CLI:
```bash
supabase login
supabase link --project-ref <project-ref>
supabase storage ls ss:///                      # list buckets (expect: notes, thumbnails)
supabase storage cp -r ss:///notes ./storage/notes --experimental
supabase storage cp -r ss:///thumbnails ./storage/thumbnails --experimental
```

Option B — S3 protocol (better for large buckets): Dashboard → Storage → **S3 Connection** → create an access key, then:
```bash
export AWS_ACCESS_KEY_ID=...   AWS_SECRET_ACCESS_KEY=...
aws s3 sync s3://notes ./storage/notes --endpoint-url https://<project-ref>.supabase.co/storage/v1/s3 --region <region>
aws s3 sync s3://thumbnails ./storage/thumbnails --endpoint-url https://<project-ref>.supabase.co/storage/v1/s3 --region <region>
```
Delete that S3 access key afterwards.

## 5. Configuration that lives outside the database (screenshot or copy it)

- Authentication → URL Configuration (Site URL, Redirect URLs); Providers (email confirmation on/off); SMTP settings (Resend); Email Templates.
- Edge Functions → list of deployed functions (names, and whether "Verify JWT" is on). Run `supabase functions list` and save the output. **This also answers whether `login-with-mobile` and `request-password-reset-by-mobile` exist on live.**
- `supabase secrets list` (names only; values cannot be read back, so keep your own copy of the Razorpay keys and webhook secret).
- Razorpay Dashboard → Webhooks: URL, events enabled, secret exists.
- Storage → each bucket's **Public** toggle (note it; Phase 1 needs this).

## 6. Baseline counts (run in the SQL editor, save the output; used to prove nothing was lost)

```sql
select 'profiles' t, count(*) from public.profiles
union all select 'orders_'||status, count(*) from public.orders group by status
union all select 'purchases', count(*) from public.purchases
union all select 'payments', count(*) from public.payments
union all select 'products', count(*) from public.products
union all select 'notes', count(*) from public.notes
union all select 'quiz_scores', count(*) from public.quiz_scores
union all select 'auth.users', count(*) from auth.users
union all select 'storage_'||bucket_id, count(*) from storage.objects group by bucket_id
union all select 'bucket_public_'||id||'='||public::text, 1 from storage.buckets;
```
Also save `select sum(amount) from public.purchases where status='success';`.

## 7. Verify the backup (do not skip)

```bash
ls -lh                                   # files exist, none is 0 bytes
pg_restore --list full.dump | head -50   # readable
du -sh storage/*; find storage/notes -type f | wc -l   # matches the storage_notes count from step 6
```
Best check: restore `full.dump` into a throwaway local Postgres (`createdb scratch && pg_restore -d scratch --no-owner full.dump`, some Supabase-internal warnings are normal) and re-run the step 6 counts there. They must match.

## 8. Store it safely

The files contain student names, emails and phone numbers. Encrypt them (`gpg -c` or `age`), keep two copies in two places (not only this laptop), and do not commit them to git.

## 9. Confirm

Reply with: **"Backup done"** plus the latest-backup timestamp / file sizes, the step 5 items (`supabase functions list` output especially), and the bucket Public flags. Only then does Phase 1 start.

---

# Abuse check

Run `docs/phase0/abuse_detection.sql` in the SQL editor. It is one read-only `SELECT`. I tested it on a scratch Postgres built from the live table definitions: a normal order produced no rows; a "swapped product" order and a forged direct-RPC grant were both flagged.

| check_id | What it catches |
|---|---|
| A1, A2 | Paid order with no payment record, or missing Razorpay ids |
| A3 | Payment ids that are not real Razorpay format (`pay_` / `order_` + 14 characters). A forged RPC call can pass any text |
| A4, A4b, A11 | Amount paid differs from the product price, or is far below it |
| A5, A6 | Product on the order or purchase is different from the product the payment session was created for (the order-swap attack) |
| A7, A8 | Purchase without a payment, or purchase whose order is not paid |
| A9 | Paid order that never had a checkout session (forged order or forged grant) |
| A10 | Bursts of paid orders by one user |

How to read results: **HIGH rows need a manual look at your Razorpay dashboard** (search the payment id / order id; does a captured payment of that amount exist?). A4 can be a false alarm if you changed a price after the sale. Do **not** delete or revoke anything yourself yet; send me the (redacted) rows and we decide together.

## Limits (be honest about what cannot be detected from the database)

1. **Order swap (A5/A6)** is only detectable while `payment_sessions` rows still exist. Nothing deletes them today (the 30-day purge migration is not applied), so the whole history should be checkable. Without the sessions, the only other source is Razorpay: each Razorpay order's `notes.productId` was set by the server at checkout time. Compare it to the order's `product_id` in the Razorpay dashboard/export for suspicious rows.
2. **Users who unblocked themselves cannot be found from table data.** `profiles` has no history and no `updated_at` on live. What you can do:
   - Compare against your own records of who you blocked (Admin panel → Users, and any notes).
   - Dashboard → **Logs → API Gateway (edge logs)**, then run:
     ```sql
     select cast(timestamp as datetime) as ts, r.method, r.path, event_message
     from edge_logs
       cross join unnest(metadata) as m
       cross join unnest(m.request) as r
     where r.method = 'PATCH' and r.path like '/rest/v1/profiles%'
     order by timestamp desc limit 200
     ```
     This lists profile updates made through the API. Request bodies are not logged, so it shows *that* a profile was patched, and which `id=eq.` it targeted, not what changed. Log retention depends on your plan (often 1–7 days), so it may not reach back far.
3. **Direct calls to `grant_razorpay_payment()`** leave no trace of the caller in the tables; A1/A3/A7/A9 are the indicators. Postgres logs may show the RPC calls if retained.
4. Zero rows does not prove no abuse; it means none matching these patterns. A careful attacker who used a real ₹1 payment for the swap is caught by A4b/A5/A6, but only if the data is intact.
