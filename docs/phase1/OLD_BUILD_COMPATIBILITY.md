# Old app builds: what they use, and what Phase 1A / 1B do to them

Source of truth: the mobile-app git history (the pre-merge history is reachable as the second parent of merge commit `9e436f9`).

## 1. Which build first used signed URLs for notes?

| versionCode | Built from | How it opens / downloads a note PDF |
|---|---|---|
| **1** | `898e179` (2026-07-11, "Initial commit") | raw `note.pdfUrl` = **public URL** (`/storage/v1/object/public/notes/...`). No `secureNotesService`. |
| 2 | no commit in the repo (history goes 898e179 → 6489ce6) | **unknown** |
| **3** | **`6489ce6` (2026-07-25) "sync all pending fixes…"** and each later July commit (`e0b5dd2`, `580db0a`) | **signed URL**: `NotesScreen` calls `getSecureNoteUrl()` → `supabase.storage.from("notes").createSignedUrl()` for both opening and downloading. Downloaded files are opened from the local `file://` copy. No code path in v3 uses a public notes URL. |
| 4+ (new, `version` 1.1.0) | current source | signed URL + force-update gate + `app_open` event |

`versionName` is "1.0.0" for versionCodes 1, 2 and 3, so **versionCode is the only way to tell them apart.**

### How to check what the Play Store build does
1. **Play Console → Statistics → "Installs by app version"** (or "Active installs"), grouped by **version code**. Anything ≥ 3 uses signed URLs. Send me the numbers for 1 and 2.
2. **Inspect the released AAB/APK** (no source needed):
   `unzip -p app-release.aab base/assets/index.android.bundle | strings | grep -c "isn't available to you right now"` → `> 0` means it contains the signed-URL code.
3. **Server logs** (Dashboard → Logs → API Gateway): compare daily `GET /storage/v1/object/public/notes/…` (public fetches) with `/storage/v1/object/sign/notes/…` (signed). The ready-to-run queries are in `docs/phase1/queries/old_builds_from_logs.md`. Public fetches can also come from browsers holding an old link.

## 2. Does anything in Phase 1A break the released (v3) build?

Method: I listed every table, RPC, Edge Function and storage call in the v3 source (`git grep` at `580db0a`), ran the exact same operations as a signed-in student against a scratch database restored from your production schema dump, **before and after** the 1A migration, and kept the result as a permanent test: `supabase/tests/phase1a_old_build_compat.sql` (18 checks, all PASS).

### What v3 depends on, and the 1A effect

| v3 dependency | Used for | Effect of 1A | Verified by |
|---|---|---|---|
| `years`, `subjects`, `chapters`, `notes`, `videos`, `quiz_tests`, `products` (`select`, active only; `select *, subjects(title), years(title)` embeds) | catalogue | Policies change from "any signed-in user" to "signed in + own course/year". Every existing student is backfilled to course `bams` with no year, and the temporary NULL-year fallback makes that mean "all BAMS content", so what they see is unchanged (before/after counts identical on the replica: years 2, subjects 2, chapters 2, notes 3, videos 1, quizzes 1, products 2). Embeds stay unambiguous: exactly one FK between each embedded pair. | C1, C2, C3 |
| `orders` insert (`user_id, product_id, scope, amount, status:'created', chapter_id/subject_id/year_id/year_ids`) + `select *` | Buy Now | Insert still works. **New: the server overwrites `amount`, `scope` and ids from `products`** (the app already sends the same values). Inserting a status other than `created`, or for an inactive product, is rejected. | C5 |
| `orders` update `status='failed'` (checkout failed / cancelled / Back) | order bookkeeping | Still works for an **unpaid** order. **New: rejected on a paid order** (this is the bug that produced your 2 `failed`-with-purchase orders); the app already ignores that error (`.catch(() => {})`). | C6, T17 |
| `purchases` `select *` (own) | "My purchases", unlock | unchanged (extra columns are ignored) | C4 |
| `profiles` `select *`, `update {name, phone}` | Profile, Edit profile, `blocked` check | Works. **New: `blocked`, `referral_code`, `course_id/year_id`, verification flags cannot be written by a student.** v3 writes none of them. | C4, C7 |
| signup `{data:{name}}` | Register | Works: profile gets the name, default course `bams` (temporary rule from the folded migration) and a referral code. | C12 |
| `quiz_scores` upsert, `push_tokens` upsert/delete, `analytics_events` insert (also anon), `notifications` select | quizzes, push, analytics | unchanged. (New: `analytics_events` older than 12 months are purged.) | C8–C11 |
| Storage: `createSignedUrl` on `notes` | open / download PDFs | **Untouched in 1A.** Buyers keep access; the legacy public-read policy and bucket flags are unchanged, so the "first PDF free" preview behaves exactly as today. | C13, C14 |
| Edge Functions `create-payment-session`, `pay`; `verify-payment` (payment recovery); `delete-account` | payments, account deletion | **No Edge Function is redeployed in 1A.** They call `grant_razorpay_payment` with the service-role key, which keeps working. | see §4 |
| RPC `delete_my_account()` | not called by v3 (v3 uses the `delete-account` Edge Function) — kept anyway per your requirement | Kept as a signed-in-only wrapper over `erase_user_data()`. | C15–C18 |

**Result: I found nothing in 1A that breaks the v3 build.** The residual risks are outside what a scratch database can prove:
- The **deployed** Edge Functions may differ from the repo (only names are known). Before applying, download and read them (§4).
- Real production data has shapes the scratch data does not (for example an order whose product was deleted, or a profile with an odd `phone`). The migration's own self-checks and the backfill sanity checks abort the whole transaction rather than half-apply, so this fails safe.
- A build with versionCode **1 or 2** (public URLs) is not affected by 1A because 1A does not touch storage.

### What 1A deliberately does NOT fix
The notes bucket stays readable through the legacy public-read policy (and by public URL if the bucket flag is Public). **That hole stays open until Phase 1B.** Keep the gap short.

## 3. Force-update: what exists, and its limits

It is already in the source (commit `a4aef2e`): `useForceUpdate` → `appConfigService.checkForRequiredUpdate()` reads `min_app_version` and `store_url` from the public `app_config` table (created by the folded migration, seeded `1.0.0`), compares against the installed **versionName**, fails **open** on any error, and shows `UpdateRequiredScreen` (blocking, opens the Play Store). The admin panel's Settings page edits `min_app_version` with validation.

What I changed for this rollout (in the repo, not deployed):
- `mobile-app/app.json`: `version` **1.0.0 → 1.1.0**. Without this the gate could never tell the new build from the old, because every build reports "1.0.0".
- `analyticsService.logAppOpen()` + a call on Home mount: logs `app_open {version, build, platform}` so you can measure adoption (`docs/phase1/queries/build_adoption.sql`).

**Limits you must plan around**
1. The gate first appears in the 1.1.0 build. **Builds already on the Play Store (versionCode 1–3) have no gate and can never be force-updated.**
2. Levers for those users: Play Store auto-update; a push notification (`send-push-notification`, v3 registers push tokens) and an in-app notification (the `notifications` table, shown by v3's Notifications screen) telling them to update; your support email list. None of these is enforced.
3. Keep `min_app_version` at `1.0.0` until the new build is widely adopted. Raising it to `1.1.0` early only matters for future 1.1.x+ builds.

## 4. Before applying 1A: read the deployed Edge Functions

```bash
mkdir -p /tmp/fn && cd /tmp/fn
for f in create-payment-session pay verify-payment razorpay-webhook delete-account send-push-notification; do
  supabase functions download "$f" --use-api      # or without --use-api if Docker is installed
done
diff -r /tmp/fn/supabase/functions ~/AyurPulse/supabase/functions   # adjust paths
```
Look for exactly three things and send me any surprise:
1. `verify-payment` and `razorpay-webhook` call `rpc("grant_razorpay_payment", …)` and do not write `purchases`/`orders` directly.
2. `create-payment-session` inserts a `payment_sessions` row with `product_id` (the table requires it) and `pay` uses it.
3. What `delete-account` calls (`erase_user_data`, `delete_my_account`, or direct table deletes).
If the deployed `pay` is older than the repo copy, that is fine: it keeps working with 1A. Do **not** redeploy the repo copies as part of 1A.
