# Account deletion: proposed server change and deployment gate

**Review only. No migration, Edge Function or production change was executed.** This proposal is separate from `supabase/migrations/`; it must not enter the migration stream until the owner approves its retention policy and staging tests.

## Current lifecycle from source

1. Settings exposes Delete Account. `usersService.deleteAccount()` invokes the `delete-account` Edge Function with the signed-in Supabase session. The client signs out and navigates to Login only after a success response. An error keeps the session and shows a retry/support message.
2. The function accepts POST, takes the user identity from the bearer token via `auth.getUser`, calls service-role `erase_user_data(user.id)`, then calls Auth Admin `deleteUser(user.id)`. It does not use a caller-supplied user ID. A retry after Auth deletion returns `already_deleted`, but that response proves only that Auth no longer finds the user; it does not independently verify all associated rows.
3. `erase_user_data` deletes analytics, quiz scores, push tokens, payment sessions, purchases, referrals and profile; it nulls `orders.user_id` and `payments.user_id` while keeping those rows and their provider/order references. It refuses admin accounts. The older `delete_my_account()` RPC remains callable by authenticated users as a compatibility path.
4. The website's `/delete-account` route offers a `mailto:` request from the registered email, rather than a server form. Submission depends on an email client and completion depends on a human mailbox process; no queue, ticket or completion log is shown in source.
5. The app's local SQLite, downloaded files and non-session AsyncStorage values are not cleared by this action. Uninstall/clear storage remains the local deletion path. The live Supabase deployment, SMTP, mailbox, backups and provider-side deletion behavior were not inspected.

## Gaps to resolve before implementation

| Record / service | Source relationship | Current behavior or uncertainty | Proposed treatment requiring approval |
|---|---|---|---|
| `wallet_order_reservations`, `first_discount_reservations` | Direct `user_id`, plus order/referral links | No explicit erase step; no FK to Auth shown | Delete open reservations for the target user before profile/Auth deletion; protect other users and in-flight settlements. |
| `wallet_ledger`, `order_review_flags` | `user_id` FK to profile with `ON DELETE SET NULL`; order/referral links, notes/details | Direct ID is cleared by profile deletion, but order links and free-text/JSON may identify the person | Decide which entries must remain for accounting/disputes; minimize or redact personal notes/details, while preserving audit integrity. |
| `first_purchase_identities` | Hashed email/phone and `account_id` without FK | Persists after account deletion; hashes can remain linkable | Decide fraud-prevention retention basis and duration. If retained, disclose it; otherwise delete by `account_id` before profile deletion. |
| `orders`, `payments`, Play/Razorpay references | `user_id` nulled, provider references retained | “Anonymized” is too strong because references can be linkable | Preserve required financial records; call them de-identified only if reidentification risk is actually addressed. Set a reviewed retention schedule. |
| `provider_events`, `payment_captures`, `payment_compensations`, `payment_jobs`, `ucb_external_refunds` | Provider payment/order IDs and order references | No direct erase step; needed for refunds/reconciliation | Inventory free-text, hashes, payload and retention. Keep active obligations, minimize personal data and document the exception. |
| `notifications` | Global content plus targeting fields; actual schema must be checked | Not explicitly erased | Inspect whether rows or payloads identify a user; remove user-specific content where safe. |
| Offline sync tables and device cache | Outbox, SQLite, files and AsyncStorage | Server table existence/deployment unclear; local cache survives | Confirm server schema, remove account-linked rows, then design safe local wipe after server success without affecting other local accounts. |
| Auth, email, Sentry, Expo, backups and support mailbox | Provider-side records | Repository cannot establish deletion/retention | Verify provider settings and manual process; disclose residual records accurately. |

## Migration design for approval

Prepare a **new dated migration** that replaces `public.erase_user_data(uuid)` only after schema inventory against the deployed database. Keep `SECURITY DEFINER`, a fixed `search_path`, null-ID rejection, admin refusal and execution restricted to `service_role`. In the same transaction and before profile deletion: clear target-only reservations; handle `first_purchase_identities` under the approved retention decision; scrub approved wallet/review fields without destroying required transaction evidence; clear any confirmed user-specific notification and sync rows; then run the existing deletes and payment/order unlinking. Do not cascade delete orders, payments, capture/refund/reporting queues or audit facts merely to simplify the notice. Ensure retries produce the same result and account B's rows remain untouched. Avoid altering `delete_my_account()` compatibility until released app versions are inventoried.

The current Edge Function has no atomic transaction spanning the RPC and Auth Admin deletion. Its `erase_user_data` RPC is atomic, but Auth deletion is a second operation. A future revision should return explicit states for `erased_auth_pending`, `deleted` and `already_deleted`; it must avoid claiming “nothing was lost” after an RPC failure and avoid claiming all data was erased after Auth lookup fails without an independent server-side completion record. Design that completion record without storing unnecessary personal data.

## Required scratch/staging tests

- Two isolated users with paid Play and Razorpay orders, purchases, referrals, wallet entries, reservations, quiz/analytics/push data and one admin. Erase A, assert every approved non-retained A link is gone and B/admin data is unchanged.
- Repeat the erase and Auth deletion; simulate failure after RPC and retry; confirm no extra entitlement, refund or payment mutation. Test invalid token, missing token, non-POST and caller-supplied B ID are rejected or ignored.
- Run settlement/refund jobs after A's deletion using synthetic provider references. Ensure active financial obligations remain reconcilable and no paid access is regranted.
- Submit a website email request through the real operational mailbox using a staging identity; verify identity checks, tracking, completion message and response time without exposing the account to an unrelated requester.
- Inspect local device data after deletion and after sign-in to another account. Confirm no former account's downloads, recent searches or outbox entries leak.

## Rollout and rollback limits

Review the exact SQL diff, FK/RLS/grants, deployed migration order and production backup policy. Apply first to a scratch database matching production, then staging with synthetic accounts and monitored jobs. Obtain explicit approval before production migration or function deployment. Dropped or redacted data cannot be restored by reversing SQL; restore would require a verified backup and may conflict with a deletion request. Keep a record of the approved retention decisions and staging evidence before release.
