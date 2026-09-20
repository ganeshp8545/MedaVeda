# Phase 2 — Referral rewards + wallet

Status: **implemented, tested on a scratch Postgres, NOT deployed.** Nothing here has touched production.

## What was built

| Layer | Change |
|---|---|
| DB | 4 new migrations (below). No old migration edited. |
| Edge Functions | `create-order` (prices server-side, `useWallet` flag), `_shared/settle.ts` + `razorpay-webhook` (refund handling), `_shared/razorpay.ts` (types). `verify-payment` unchanged (it calls the same settle path). |
| Mobile | Redesigned `ReferralScreen`, new `OrderSummaryScreen` (checkout breakdown + wallet toggle), new `ReferralTermsScreen`. |
| Admin | Referral settings form (all reward values), product type dropdown + column, reject action. Saving never writes the legacy Phase 1 columns (`reward_type`, `referrer_reward_value`, `referee_reward_value`, `qualify_on`); they stay in the table for old builds and rollback and nothing reads them. |

### Migrations (apply in this order)
1. `20260925100000_phase2_referral_config_and_product_type.sql` — `products.product_type` (existing rows → `other`), reward config columns on `referral_settings`, `referrals.first_order_id`.
2. `20260925110000_phase2_wallet_ledger.sql` — append-only `wallet_ledger`, `get_my_wallet()`, `get_my_referral_list()`, release job (+ optional pg_cron), admin reversal.
3. `20260925120000_phase2_orders_pricing_and_settlement.sql` — order price breakdown columns, `create_priced_order()`, `quote_my_order()`, new `grant_razorpay_payment()` (wallet debit + referrer credit), `handle_payment_refund()`, stricter `apply_referral_code()`, `admin_reject_referral()`.
4. `20260925140000_phase2_single_use_friend_discount.sql` — `referrals.discount_order_id`, `discount_reused` flag reason, and the single-use guard inside `settle_razorpay_payment()` (below).

### Rules → where they are enforced
| Rule | Enforced in |
|---|---|
| All values editable, none hardcoded | `referral_settings` columns; app + server read them |
| Friend: 10% off first purchase, max ₹100, on selling price | `create_priced_order` (uses `products.price`, never `original_price`); first purchase = no successful purchase + `referrals.first_order_id is null` |
| Friend discount usable **at most once** | `settle_razorpay_payment`: the first discounted order to settle claims `referrals.discount_order_id`; a second discounted order is a reuse (see decision 9). Pricing alone can't stop it: several open checkouts can all be priced with the discount, and a cancelled one can still be paid. |
| Referrer ₹50 after friend's first **paid** purchase | `grant_razorpay_payment` (runs only after Razorpay capture is verified) |
| 7-day pending → available | credit inserted `pending`, `available_at = now + credit_hold_days`; released lazily on every balance/pricing read + optional 15-min cron |
| Refund inside hold cancels credit | `handle_payment_refund` ← webhook `refund.processed` (re-fetches payment from Razorpay, full refunds only) |
| No expiry (optional field) | `credit_expiry_days` = NULL |
| Wallet ≤ 50% of price | `create_priced_order`: `floor(base × wallet_max_percent)/100`, `base` = price **after** friend discount |
| Wallet on notes only | `products.product_type in wallet_product_types` (`notes`, `notes_bundle`), checked server-side; otherwise HTTP 400 |
| Append-only ledger, clients SELECT own rows | privileges + RLS + `block_client_writes` + `wallet_ledger_append_only` trigger (also stops `service_role` editing/deleting history) |
| Wallet debited once, only on a live order | `settle_razorpay_payment` + unique index `one debit per order`; cancelled / failed / expired orders are refused and flagged |
| No self-referral / one credit per friend / signup only | `referrals` check + RPC; unique index on referral credit; `apply_window_days` (default 2) + no prior purchase |
| Client can't tamper | no client write on orders/ledger; amounts never accepted from the client; price breakdown columns immutable by trigger |

## Decisions (confirmed)
1. **Product type:** `products.product_type`; existing products start as `other` (wallet off) until tagged `Notes` / `Notes bundle` in the admin panel.
2. **50% cap** is on the price **after** the friend discount.
3. **Code window** `apply_window_days` = 2 (configurable 1–30).
4. **Refund after the 7-day hold:** credit kept and logged; admin can post a reversal (`admin_reverse_wallet_credit`).
5. **Wallet restored on refund:** a full refund of an order that debited wallet credit posts a `credit` / `available` / `order_refund` ledger row for the amount actually debited. Once per order (unique index + `ON CONFLICT DO NOTHING`), so webhook retries can't double-restore. Partial refunds restore nothing. An order that never debited (e.g. flagged as stale) restores nothing.
6. **Stale orders (cancelled / failed / expired):**
   - Creating a checkout cancels **all** the user's older unpaid orders.
   - Orders get `expires_at = now + checkout_expiry_minutes` (config, default 30, immutable).
   - **Razorpay's Orders API has no `expire_by`** (only Payment Links do; I checked the docs), so a Razorpay order can't be expired on their side. Instead: (a) the app passes Checkout's `timeout` (seconds, server-driven) so the sheet stops accepting payment at expiry — best-effort, browsers can pause timers in background tabs; (b) **the database is the enforcement**: `settle_razorpay_payment` compares the payment's own start time (Razorpay `payment.created_at`, not client-supplied) with `orders.expires_at`.
   - A payment for a cancelled/failed order, or one **started** after expiry, is real cash: access is still granted, but the wallet is **not** debited and a row is written to `order_review_flags` (`stale_order_paid`, one per order, replay-safe) for an admin. A payment started before expiry but captured late (slow UPI) is treated as valid.
   - Flags are readable by admins only; resolve with `admin_resolve_order_flag(id, note)`.
7. `orders.amount` = final payable; breakdown columns beside it. Old orders: `list_price NULL`.
8. Program off (`enabled=false`) stops discounts, code entry and new credits; existing wallet balances stay visible and spendable.
9. **Friend discount is single-use, enforced at settlement.** `friend_discount_percent` is the only column that prices the friend's discount; the legacy `referee_reward_value` / `reward_type` are read by nothing. If two discounted orders of the same friend are both paid (two checkouts, or a cancelled one paid late), the first to settle wins the discount. The second is a **reuse**: the customer paid real money for what checkout showed, so **access is granted**, but there is **no wallet debit, no referrer credit**, and a `discount_reused` row is written to `order_review_flags` (one per order, replay-safe, admin-only, resolve with `admin_resolve_order_flag`). A reuse that was also a cancelled checkout carries both flags (`stale_order_paid` and `discount_reused`). Recovering the discount (or not) is an admin decision; nothing is refunded automatically. Settlements for one friend are serialised by the per-user advisory lock, so two payments can't both claim it.

## Known limits
- A flagged (stale) order that carried a **friend discount** keeps the discount and still counts as the friend's first purchase (real money was paid); it is only flagged for review. Wallet is what is withheld.
- Friend deleting their account inside the hold does not cancel the referrer's credit.
- No admin screen for `order_review_flags` / ledger yet (query them in the Supabase table editor, or use the two admin RPCs).
- A reused discount is not clawed back automatically: the flag is the whole mechanism, and an admin decides whether to bill or refund the difference.
- Edge Function TypeScript is checked with `deno check` (all three functions); mobile and admin `tsc` are clean.

## Test evidence
Scratch Postgres 17 restored from `docs/live-schema/live_schema.sql`, all migrations `20260919…` → `20260925140000` applied in order, then:
`psql -f supabase/tests/phase2_referral_wallet_checks.sql` → **0 FAIL, 123 PASS** (106 original checks + 17 single-use-discount checks U1–U17), on a database rebuilt from scratch through the full migration chain; re-applying the Phase 2 migrations on top: no errors (idempotent). Disabling the stale-order logic makes the suite fail, so the item 5 checks are not vacuous; running the suite against the pre-hardening `settle_razorpay_payment` fails 8 of the U checks, so those are not vacuous either. I also confirmed the wallet rule is data-driven (adding `video` to `wallet_product_types` flips the video check). Account erasure of referrer/friend with ledger rows works (rows anonymised, kept).
Pre-existing suites `critical_fixes_checks`, `multi_course_checks`, `account_deletion_checks` fail identically on a baseline DB without Phase 2 and on the Phase 2 DB (scratch-environment gaps: no storage buckets / seed data), so no regression detected, but they did not exercise Phase 2 either.

## Test checklist

Automated = covered by `phase2_referral_wallet_checks.sql` (ID in brackets). **Manual = do on staging with Razorpay test keys.**

### Abuse / eligibility
- [ ] Self-referral blocked [R1]
- [ ] Code refused after signup window [R2]; second code refused [R5]; refused when program disabled [R7]
- [ ] Student cannot edit `referrals` [R6]
- [ ] Manual: sign up a new account with a real code → friend sees discount on summary screen; existing user (has purchases) cannot apply a code
- [ ] One credit per friend, DB-enforced [P7]; second purchase creates none [P9]

### Credit only after payment / 7-day hold
- [ ] Unpaid/abandoned/failed order creates no credit and no debit [P1, W6, W13]
- [ ] Manual: pay with Razorpay test card → referrer sees **Pending ₹50**, Available unchanged [P2–P5]
- [ ] Replay of the webhook/verify creates no duplicate credit [P6]
- [ ] Before day 7 stays pending [H2]; after day 7 available and referral shows *Credited* [H3–H5]
- [ ] Manual (cron path): confirm job `release-wallet-credits` exists (`select * from cron.job`) or accept lazy release

### Refunds
- [ ] Full refund inside hold cancels credit, referral rejected, list shows *Cancelled* [F3–F5, F7]
- [ ] Partial refund ignored [F2]; duplicate event no-op [F6]
- [ ] Refund after hold: credit kept, flagged [F8]; admin can reverse [F9]; student cannot [F10]
- [ ] Manual: issue a real refund from the Razorpay test dashboard and confirm the `refund.processed` webhook reaches the function (check logs: `refund processed … credit_cancelled`)

### Refund restore and stale orders
- [ ] Full refund restores the wallet amount once [RW2, RW3]; duplicate event restores nothing [RW4, RW6]; partial refund restores nothing [RW1]; no-wallet order restores nothing [RW7]; friend's wallet-paid order restored too [F3b]
- [ ] New checkout cancels older unpaid orders [E1]; `expires_at` ≈ +30 min and immutable [E2, E3]
- [ ] Paying a cancelled order: access granted, no wallet debit, flagged [E5–E7]; replay stays undebited [E8]; nothing to flag without wallet/discount [E9]; live order still debits [E10]
- [ ] Payment started after expiry: flagged, no debit [E11]; started before expiry, captured late: valid [E12]
- [ ] Flagged order refund restores nothing [E13]; admin-only flags [E15–E19]
- [ ] Manual: open checkout, wait >30 min (or set `checkout_expiry_minutes` to 5 on staging), confirm Razorpay Checkout closes; start a second checkout and confirm the first order shows `cancelled`

### Single-use friend discount
- [ ] Both open checkouts are priced with the discount (pricing can't stop it) [U1]; newer checkout cancels the older [U2]
- [ ] First discounted order to settle claims it and is granted [U3]; second is granted too but flagged `discount_reused` [U4, U5]; referrer credited once [U6, U17]
- [ ] Replays: one flag per reason, one payment, one purchase [U7]; refunding the reuse leaves the winner and the credit alone [U8]
- [ ] Flag visible to admins only [U9, U10]
- [ ] A cancelled checkout paid first wins; the live one paid after is the reuse [U11, U12]
- [ ] Only one of two checkouts paid: granted, nothing flagged [U13]
- [ ] Reuse that asked for wallet: access granted, no wallet debit, flagged with the wallet amount [U15, U16]
- [ ] Manual: as a new friend, open checkout twice, pay both with Razorpay test cards; confirm both purchases exist, one `discount_reused` flag, one referrer credit

### Wallet rules
- [ ] Wallet refused on video product [W1] and untagged product [W2]; toggle hidden in app [W4]
- [ ] Wallet works on notes and notes bundle [W5, W9]
- [ ] 50% cap [W7]; cap applies after friend discount [W14]; order never free [W15]
- [ ] Debit only on successful settlement, once [W10, W11]
- [ ] Manual: notes product with balance → toggle visible; toggle changes breakdown; Razorpay shows the *final* amount

### Tampering
- [ ] Student can't change order amount/discount/wallet [C1, C2]; not even `service_role` [C3]
- [ ] Student can't call `create_priced_order`, mint ledger rows, insert orders [C4, C5, L3, L4, L6]
- [ ] Ledger can't be edited/deleted/truncated, even by the server [H6–H8]
- [ ] Manual: send `{productId, useWallet:true, amount:1}` to `create-order` → `amount` is ignored; wallet on a video returns 400
- [ ] Manual: old app build (v3) still buys at full price (no `useWallet`, no new UI)

### Admin
- [ ] Manual: change discount %, credit, hold days in the Referrals page → next `quote`/order uses new values without an app release
- [ ] Reject referral cancels a pending credit [J1–J3]
- [ ] Manual: tag one product Notes, save, confirm it shows in the Products table

## Deploy steps (do not run until you approve)
Order matters: **DB → functions → admin → data → app → switch on.** (`create-order` and `verify-payment` / `razorpay-webhook` now call `create_priced_order` / `settle_razorpay_payment`, so the DB must be first.)

1. **Backup** (`docs/phase0/BACKUP_GUIDE.md`). Migrations are additive but touch `orders`, `grant_razorpay_payment`, `apply_referral_code`.
2. **Staging first:** apply the 4 migrations, run `supabase/tests/phase2_referral_wallet_checks.sql` (expect `0 FAIL`).
3. **Production DB:** `supabase db push` (or run the 4 files in order). Safe for currently released apps and the currently deployed `create-order`: it only adds columns and functions, and the immutability trigger still accepts an order inserted with a Razorpay id.
4. **Edge Functions** (only after step 3):
   `supabase functions deploy create-order razorpay-webhook verify-payment`
   (verify-payment is redeployed because it bundles `_shared/settle.ts`.)
5. **Razorpay Dashboard → Webhooks:** add event **`refund.processed`** to the existing webhook (keep `payment.captured`). Same URL and secret.
6. **Admin panel:** deploy. (It needs step 3 first: it writes `product_type` and the new settings columns.)
7. **Data:** in the admin panel tag every notes product `Notes` / `Notes bundle`; open Referrals → Settings, confirm 10 / 100 / 50 / 7 / 50, save. Leave **Enabled off**.
8. **Mobile:** build a new release (EAS). Old builds keep working at full price.
9. **Switch on:** tick *Enabled* in Referrals settings once the new build is live for most users. Watch function logs for `grant_razorpay_payment … unfunded` warnings and `refund processed` lines.
10. **pg_cron (optional):** migration 2 tries to enable it; if it printed the notice "pg_cron not scheduled", enable the extension in Dashboard → Database → Extensions and re-run the `cron.schedule` block. Not required for correctness.

### Rollback
- Turn **Enabled off** in admin: stops discounts, code entry and new credits immediately (no deploy).
- Functions: redeploy previous `create-order` / `razorpay-webhook` from git; the DB is compatible with both.
- DB: nothing is dropped. The ledger and new columns can stay dormant. Do not delete `wallet_ledger` rows once real credits exist (they are financial records).
