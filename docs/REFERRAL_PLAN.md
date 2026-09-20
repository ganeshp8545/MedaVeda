# MedVeda — Referral Redesign Plan

Status: **PLAN ONLY. Nothing here is implemented. Waiting for "approved".**
Companion to `docs/AUDIT_REPORT.md` (§5 describes today's referral flow; §4 lists the security problems this plan depends on).

**Goal:** a student understands the referral value in 3 seconds, and the reward is real: the friend gets a discount at checkout, and the referrer gets wallet credit after the friend's verified payment.

---

## 0. Ground rules and prerequisites

1. **Do the audit's critical fixes first (S1, S2 in `AUDIT_REPORT.md`).** Discounts and wallet credit are money. While any signed-in user can call `grant_razorpay_payment()` or edit their own order, a referral discount or credit can be forged the same way a purchase can. Migration 1 below contains those two fixes, so it ships first regardless of the rest of this plan.
2. **The pending migrations (`20260919120000` … `20260921130000`) must be applied to production first.** The referral tables do not exist live today (`docs/live-schema/MISMATCHES.md`). Everything below builds on them.
3. **Everything is additive.** No column, table, function signature or policy that existing app builds use is dropped or renamed (see §7).
4. **Rewards are decided in the database, at settlement, never by the client or by hand.** The only code path that creates a reward is inside `grant_razorpay_payment()`, which runs only after a Razorpay signature or webhook is verified.

### Decisions I need from you (defaults below are my proposals; reply or say "approved" to accept them)

| # | Question | My proposal |
|---|---|---|
| Q1 | Launch values. The audit shows the **current** values are: disabled, reward type none, no amounts. Those are the defaults in this plan, so nothing changes for anyone until an admin turns it on. What should the first live values be? | Suggest **friend: 10% off first purchase (max ₹100)**, **referrer: ₹50 credit**. Entered in the admin panel, not in code. |
| Q2 | Can wallet credit pay for the whole price? | No: capped at 50% of the price per order (`wallet_max_percent`), so Razorpay is always charged at least a positive amount. A zero-payment checkout path is out of scope. |
| Q3 | Does credit expire? | No expiry in v1. Not withdrawable. |
| Q4 | Delay before the referrer's credit is issued (refund window)? | 0 days (`reward_delay_days` setting exists if you want 7). |
| Q5 | Does the friend's discount stack with the strike-through MRP price? | Yes: it applies to the current selling price, not the MRP. |

---

## 1. What the student sees

### 1.1 Entry points (all open the same Referral screen)
- **Home:** a "Refer & Earn" banner card under the greeting (new `ReferralBanner`), text taken live from the offer, e.g. "Invite a friend → you get ₹50". Hidden when the program is disabled.
- **Profile:** "Refer & Earn" menu row (exists today, only shown when enabled) plus a "Wallet ₹X" row.
- **Side drawer:** new "Refer & Earn" item.

### 1.2 Referral screen (rewrite of `ReferralScreen.tsx`)

```
┌───────────────────────────────────────────────┐
│  🎁  Invite a friend                          │
│  You get ₹50 · Your friend gets 10% off       │   ← big, built from admin settings
│                                               │
│  Your code                                    │
│  ┌───────────────────────┐  [ Copy ]          │
│  │  K7M3QXA              │                    │
│  └───────────────────────┘                    │
│  [ 🟢 Share on WhatsApp ]   [ Share… ]        │
│                                               │
│  How it works                                 │
│  ① 📤 Share your code or link                 │
│  ② 🛒 Your friend signs up and gets 10% off   │
│      their first purchase                     │
│  ③ 💰 You get ₹50 credit when they pay        │
│                                               │
│  Your stats                                   │
│  Invited 12 · Joined 5 · Purchased 3 ·        │
│  Earned ₹150                                  │
│                                               │
│  Wallet balance  ₹150   [ How to use it ]     │
│  Use it at checkout on any notes purchase     │
│  (up to 50% of the price per order).          │
│                                               │
│  Friends                                      │
│  Asha  · Purchased ✔ · +₹50                   │
│  Ravi  · Joined · waiting for first purchase  │
│                                               │
│  Have a friend's code?  [ enter code ] [Apply]│   ← only if not yet referred, in window
└───────────────────────────────────────────────┘
```

- **Headline:** built from `referral_offer()` (values from admin settings; nothing hardcoded). If the friend reward is a flat amount it reads "₹100 off". If a reward is `none` the sentence for that side is dropped.
- **WhatsApp button:** opens `whatsapp://send?text=…` with a pre-written message: "Hey! I use MedVeda for BAMS/BNYS/BSMS/BUMS/BHMS notes. Sign up with my code **K7M3QXA** and get 10% off your first purchase: https://medveda.in/r/K7M3QXA". Falls back to the system share sheet if WhatsApp is not installed.
- **App link:** `https://medveda.in/r/<CODE>` (new static page on the website, §6.4). It shows the code with a copy button and sends the visitor to the Play Store with `referrer=<CODE>` so the app can **prefill the code on first launch** (Android install referrer via the already-installed `expo-application`).
- **Stats:** Invited = share taps (logged with the existing `analyticsService`), Joined = referral rows, Purchased = friends whose first payment settled, Earned = sum of posted credit.
- **Status words** change to plain language: "Joined", "Purchased ✔", "Not eligible".
- **Empty/disabled state:** explains that the program is not available now, with no dead ends.

### 1.3 New user: sign up
- Register screen gets **"Have a referral code?"** (collapsed by default, expanded and prefilled when the install referrer or a link supplied one).
- **Live validation** (debounced, 500 ms) via a new rate-limited edge function `validate-referral-code`:
  - ✅ "Code applied! You get 10% off your first purchase (up to ₹100)."
  - ❌ "We couldn't find that code." / "Referral codes can't be used right now."
- **The code no longer depends on the phone.** It is sent as signup metadata (`referral_code`) and applied **on the server** the moment the account is created (new auth trigger, §4). This removes today's silent-loss cases: different device, different email, program-off, late verification. The result is stored and shown in-app after login: "Referral code K7M3QXA applied — 10% off your first purchase", or a clear reason if it was rejected.
- The old on-device pending-code path stays as a fallback for older app builds.

### 1.4 New user: checkout
A new **Order summary** step sits between "Buy" and Razorpay (new `OrderSummaryScreen`):

```
Order summary
  Anatomy – Year 1 notes                     ₹499
  🎁 Referral discount (K7M3QXA)  −10%      −₹50
  💰 Wallet credit  [x] Use ₹100            −₹100   (max 50% of price)
  ─────────────────────────────────────────────
  You pay                                    ₹349
  [ Have a code?  ______  Apply ]
                            [ Pay ₹349 ]
```

- Original price, referral discount, wallet credit and final price are always shown as separate lines, from the server quote (`quote_checkout`). The amount charged by Razorpay is recomputed independently on the server in `pay`, so the screen can never lower the price.
- A code can also be entered here if the student has none applied and is still eligible.
- After payment, `PaymentSuccessScreen` shows "You saved ₹150" and gets a **"Start reading"** button that opens the purchased chapter (audit gap).

---

## 2. Configurable values (admin panel, no hardcoding)

All reward values live in `referral_settings` (single row). Defaults equal today's values, so applying the migration changes nothing until an admin edits them.

| Setting | Default | Meaning |
|---|---|---|
| `enabled` | **false** (today) | Master switch. |
| `referee_reward_type` | **`none`** (backfilled from today's `reward_type`) | `none` / `discount_percent` / `discount_flat` — the friend's reward. |
| `referee_reward_value` | **NULL** (today's `referee_reward_value`) | % or ₹. |
| `referee_discount_max` | NULL | ₹ cap when the type is percent. |
| `referrer_reward_type` | **`none`** (backfilled) | `none` / `credit` — the referrer's reward. |
| `referrer_reward_value` | **NULL** (today's `referrer_reward_value`, kept only if today's type was credit or flat) | ₹ credit. |
| `min_purchase_amount` | 0 | A friend's payment must be at least this to qualify. |
| `max_referrals_per_user` | NULL = unlimited (today) | Existing setting. |
| `max_credit_per_referrer` | NULL = unlimited | Lifetime credit cap per referrer. |
| `apply_window_days` | **7** (today's hardcoded `interval '7 days'` in `apply_referral_code`) | How long after signup a code can still be applied. |
| `reward_delay_days` | 0 | Wait before crediting the referrer. |
| `wallet_max_percent` | 50 | Max share of an order payable with wallet credit. |
| `qualify_on` | kept, **no longer read** | Rewards always require the friend's verified payment (rule 5.3). Hidden in the admin UI. |
| `reward_type` (old single field) | kept, no longer read | Retained for rollback and old builds. |

Every change is written to a new `referral_settings_history` table (who, when, old → new) by trigger.

---

## 3. Admin panel

**`Referrals` page becomes three tabs** (`pages/Referrals.tsx`, new components):

1. **Settings** — the table above as a form, grouped "Friend reward", "Referrer reward", "Limits", "Wallet". Live preview of the exact headline students will see. Validation: percent ≤ 100, values ≥ 0, cap ≥ 0, you cannot enable the program with both rewards `none` unless you confirm "track only". Shows the last change from `referral_settings_history`.
2. **Referrals** — table with: referrer, friend, code, applied date and how (signup / profile / checkout / legacy), status, friend's qualifying order and amount, **discount given**, **credit given**, flag/reject reason. Filters: status, date range, flagged. Actions: **Reject** (with reason; reverses unspent credit via `admin_reject_referral`), **Open user**. CSV export. The old "mark rewarded" dropdown is removed: rewards are issued only by settlement.
3. **Wallet** — search a user, see balance and ledger, **Adjust** (±₹, mandatory note; goes through `admin_adjust_wallet`, always logged with the admin's id).

Also: **Users** page gains a wallet column; **Orders** page shows list price / referral discount / wallet used / paid; **Dashboard** gets a referral tile (joined, purchased, credit issued, credit outstanding).

---

## 4. Database changes (migrations)

Four new migrations, applied in order, all idempotent, each starting with the same pre-flight row-count `DO` block used in `20260919120000`. File names use timestamps after the last existing one (`20260921130000`).

### Migration 1 — `20260922100000_lock_settlement_and_orders.sql` (prerequisite; audit S1/S2)
- `revoke execute on function public.grant_razorpay_payment(text,text,text,bigint) from anon, authenticated;` (grant stays with `service_role`).
- Order integrity: a `BEFORE UPDATE` trigger on `orders` that, for non-admin, non-service callers, raises if `product_id`, `amount`, `scope`, `chapter_id`, `subject_id`, `year_id`, `year_ids`, `razorpay_order_id`, `razorpay_payment_id`, `course_id` change (the client may still cancel via `status`). Guards the same columns for `status = 'paid'` on insert (belt and braces).
- `payment_sessions.product_id` becomes the source of truth for settlement (the grant function reads the product from the session/order snapshot written by `pay`, not from a client-writable column).
- Generic guard: a query in `supabase/tests/` that fails if any `SECURITY DEFINER` function in `public` is executable by `anon`/`authenticated` and is not on an explicit allow-list.

### Migration 2 — `20260922110000_referral_v2_settings_and_ledger.sql`
- **`referral_settings`:** add `referee_reward_type`, `referee_discount_max`, `referrer_reward_type`, `min_purchase_amount`, `max_credit_per_referrer`, `apply_window_days` (default 7), `reward_delay_days` (default 0), `wallet_max_percent` (default 50). Backfill: `referee_reward_type := reward_type` when it is `discount_percent`/`discount_flat` else `none`; `referrer_reward_type := 'credit'` only when the old type was `credit` or `discount_flat` and a value exists, else `none`; old columns untouched.
- **`referral_settings_history`** (append-only, admin read) + trigger.
- **`referrals`:** add `applied_via` (`signup`/`profile`/`checkout`/`legacy`, existing rows backfilled `legacy`), snapshot columns taken when the code is applied (`referee_reward_type`, `referee_reward_value`, `referee_discount_max`, `referrer_reward_value`), `qualifying_order_id` (FK `orders`), `qualified_amount`, `referee_discount_amount`, `referee_discount_order_id`, `referrer_credit_txn_id`, `flagged boolean`, `flag_reason`, `reward_due_at`. Existing rows and their statuses are **not rewritten**; new logic keys off `qualifying_order_id` and `referrer_credit_txn_id`, not off the old `qualified` status (which the signup mode set before any purchase).
- **`wallet_transactions`** (append-only ledger): `id uuid`, `user_id`, `kind` (`referral_reward` / `purchase_redeem` / `admin_adjust` / `reversal`), `amount numeric(10,2)` (+credit, −debit), `status` (`held` / `posted` / `released`), `referral_id`, `order_id`, `created_by`, `note`, `created_at`. Unique partial indexes: one `referral_reward` per `referral_id`; one active `purchase_redeem` per `order_id`.
- `wallet_balance(uid)` = sum of `posted` + unexpired `held` (a hold expires after 30 minutes without settlement, so no cron job is needed; pg_cron is not installed).
- **`referral_code_checks`** (ip hash + timestamp, RLS on, no policies) for rate limiting.

### Migration 3 — `20260922120000_referral_v2_checkout_pricing.sql`
- **`orders`:** add `list_price`, `referral_discount` (default 0), `wallet_applied` (default 0), `referral_id`. Backfill `list_price := amount` for existing rows (no discounts ever existed). **`purchases`:** add `list_price`, backfilled from `amount`. **`payment_sessions`:** add `use_wallet boolean default false`.
- **`compute_checkout(p_user, p_product_id, p_use_wallet)`** — internal `SECURITY DEFINER`, **revoked from `anon`/`authenticated`/`public`**, callable by `service_role` only. Single source of pricing truth. Rules: list price = `products.price`; referral discount only if the user has a referral row with no `referee_discount_order_id`, no prior successful purchase, program enabled, `min_purchase_amount` met; discount from the row's snapshot, capped by `referee_discount_max`; wallet applied = `min(balance, wallet_max_percent% of price after discount)`; final price never below ₹1.
- **`quote_checkout(p_product_id, p_use_wallet)`** — `authenticated` wrapper using `auth.uid()`; returns the itemised breakdown for the summary screen.
- **`grant_razorpay_payment()` patched** (built on the latest definition in `20260921130000`, keeping its deleted-account guard). In the same locked transaction, after the purchase row is written: (a) post the wallet hold as a debit, (b) mark the friend's discount used (`referee_discount_order_id`, `referee_discount_amount`), (c) if this is the friend's **first** successful purchase and `qualified_amount ≥ min_purchase_amount` and the referral is not rejected/flagged: set `qualifying_order_id`, status `qualified`, and insert the referrer's `referral_reward` ledger row (respecting `max_credit_per_referrer` and `max_referrals_per_user`); if `reward_delay_days > 0`, set `reward_due_at` and post later (lazy: posted the first time the balance is read after the date), then status `rewarded`. Fully idempotent: replays hit the unique indexes.

### Migration 4 — `20260922130000_referral_v2_rpcs_and_admin.sql`
- **`referral_offer()`** — readable by `anon` and `authenticated` (public info, like `app_config`): returns enabled + the reward values and cap for headlines and validation messages. No user data.
- **`apply_referral_code(p_code)`** — same name, arguments and JSON shape (old builds keep working), extended: window from `apply_window_days`, snapshot of reward values, requires the caller's email to be verified, rejects if referrer and friend share a normalised phone, failed-attempt throttle (5 per hour per user), new statuses `not_verified`, `too_many_attempts`.
- **`apply_referral_for_new_user(uid, code)`** — internal (service-only), and an **`AFTER INSERT` trigger on `auth.users`** named `on_auth_user_created_referral` that reads `raw_user_meta_data->>'referral_code'`. It sorts after `on_auth_user_created`, so the profile row already exists. A bad code never fails signup; the outcome is stored (`referral_apply_result` on the profile row or a small table) so the app can show it.
- **`get_my_referral_summary()`** (joined / purchased / earned / balance), **`get_my_referrals_v2()`** (adds purchased flag and credit per row; the existing `get_my_referrals()` stays unchanged for old builds), **`get_my_wallet()`** (balance + last 50 ledger rows).
- **`admin_adjust_wallet(uid, amount, note)`** and **`admin_reject_referral(id, reason)`** — `am_i_admin()` guarded, explicitly revoked from `anon`. Rejecting a referral posts a `reversal` for the credit if it is unspent.
- **`erase_user_data()`** extended: wallet rows are anonymised (`user_id` set to NULL, kept for accounting like orders), referral rows handled as today.

### RLS policies
| Table | Policy |
|---|---|
| `wallet_transactions` | RLS on. `SELECT` own rows or admin. **No** insert/update/delete policy for any client role (writes only through the definer functions above). |
| `referrals` | Keep `referrals_read_own` and admin policies. New `BEFORE UPDATE` trigger: nobody but the settlement function may set status `rewarded` or fill reward columns; an admin may only `reject`. |
| `referral_settings` | Keep authenticated read and admin write; new columns are covered. |
| `referral_settings_history` | Admin `SELECT` only, filled by trigger. |
| `referral_code_checks` | RLS on, no policies (service-role only). |
| `orders` (Migration 1) | Clients cannot change pricing/product/razorpay columns after insert. |
| Functions | Every new `SECURITY DEFINER` function: `revoke all … from public, anon, authenticated;` then a targeted `grant execute` (to `authenticated`, `anon` for `referral_offer` only, or `service_role`). |

---

## 5. Abuse prevention

1. **No self-referral.** Existing `CHECK (referrer_id <> referred_id)` plus a new rule: referrer and friend cannot share a `phone_normalized` value or the same normalised email (dots/`+tag` stripped for Gmail-style addresses). Violations are stored as `rejected` with a reason.
2. **One referral per new user.** Existing `UNIQUE (referred_id)`; the code can only be applied within `apply_window_days` of signup and before the first purchase.
3. **Reward only after the friend's successful verified payment.** The referrer credit is created only inside `grant_razorpay_payment()`, i.e. after Razorpay signature/webhook verification and the amount check. The old `qualify_on = 'signup'` mode no longer produces rewards. No client, admin dropdown or API call can set a referral to `rewarded`.
4. **Friend must be verified.** Email verification is required before a code can be applied.
5. **Caps.** `max_referrals_per_user`, `max_credit_per_referrer`, `min_purchase_amount`, one friend discount per friend (first purchase only).
6. **Rate limits.** Code validation: per-IP hash (20 per hour) in `validate-referral-code`; code application: 5 failed attempts per hour per user, so brute-forcing 7-character codes is impractical.
7. **Refund clawback.** If an order that earned a reward is refunded, `admin_reject_referral` reverses unspent credit; already-spent credit is flagged for review.
8. **Ledger integrity.** Append-only, unique indexes prevent double reward and double redemption; every admin change is attributed and requires a note.
9. **Held credit.** Wallet credit reserved for an in-progress checkout cannot be spent twice; unsettled holds lapse after 30 minutes.
10. **Not in v1 (possible later):** device fingerprinting, and comparing the payer's UPI ID/card fingerprint between referrer and friend via the Razorpay payment fetch. Both need extra privacy review.

---

## 6. Files to create or modify

### 6.1 Supabase (`supabase/`)
Create:
- `migrations/20260922100000_lock_settlement_and_orders.sql`
- `migrations/20260922110000_referral_v2_settings_and_ledger.sql`
- `migrations/20260922120000_referral_v2_checkout_pricing.sql`
- `migrations/20260922130000_referral_v2_rpcs_and_admin.sql`
- `functions/validate-referral-code/index.ts` (public, rate-limited, returns only validity and offer text; add `[functions.validate-referral-code] verify_jwt = false` to `config.toml`)
- `tests/security_grants_checks.sql`, `tests/referral_v2_checks.sql`
Modify:
- `functions/create-payment-session/index.ts` — accept `useWallet`, store it on the session, reject a product the user already owns, reject quotes under ₹1.
- `functions/pay/index.ts` — replace `product.price` with `compute_checkout()`; Razorpay amount = final; snapshot `list_price`, `referral_discount`, `wallet_applied`, `referral_id` on the order; place the wallet hold. The response also returns the breakdown.
- `functions/verify-payment/index.ts` — return the breakdown in the success payload (no logic change to signature verification).
- `functions/delete-account/index.ts` — no code change expected; `erase_user_data` is extended in Migration 4.
- `config.toml` — new function entry.
- `tests/delete-account-harness/*` — extend for wallet rows.

### 6.2 Mobile app (`mobile-app/`)
Create:
- `src/screens/payment/OrderSummaryScreen.tsx`
- `src/components/ReferralBanner.tsx`, `ReferralCodeInput.tsx` (debounced live validation, reused on Register / Referral / Order summary), `PriceBreakdown.tsx`, `HowItWorks.tsx`, `ReferralStats.tsx`
- `src/services/walletService.ts`, `src/repositories/walletRepository.ts`
- `src/hooks/useReferralOffer.ts`, `useCheckoutQuote.ts`, `useWallet.ts`
- `src/utils/shareReferral.ts` (WhatsApp deep link with share-sheet fallback, message builder), `src/utils/installReferrer.ts` (Android install referrer via `expo-application`)
- `src/types/wallet.ts`, `src/types/checkout.ts`
Modify:
- `src/screens/referral/ReferralScreen.tsx` — full rewrite per §1.2.
- `src/screens/auth/RegisterScreen.tsx`, `features/auth/authService.ts` — code field with live validation; send `referral_code` (and fix the `full_name`/`mobile_number` vs `name` mismatch flagged in the audit, agreed separately).
- `src/screens/home/HomeScreen.tsx` — banner; replace the success-only alert with a status message.
- `src/screens/profile/ProfileScreen.tsx`, `src/components/SideDrawer.tsx` — entry points and wallet row.
- `src/services/referralsService.ts`, `repositories/referralsRepository.ts`, `types/referral.ts` — new RPCs and types; keep old ones.
- `src/hooks/usePurchase.ts`, `services/paymentService.ts` — go through the summary screen, pass `useWallet`.
- `src/screens/payment/PaymentCheckoutScreen.tsx`, `PaymentSuccessScreen.tsx` — show breakdown / "You saved"; add "Start reading".
- `src/navigation/AppNavigator.tsx`, `src/types/navigation.ts` — register `OrderSummary`.
- `plugins/withAndroidQueries.js` — allow querying WhatsApp.
- `src/utils/pendingReferral.ts` — kept as fallback.

### 6.3 Admin panel (`admin-panel/`)
Create: `src/components/ReferralSettingsForm.tsx`, `ReferralTable.tsx`, `ReferralStatsCards.tsx`, `WalletPanel.tsx`, `WalletAdjustModal.tsx`; `src/services/walletService.ts`; `src/hooks/useWallet.ts`; `src/types/wallet.ts`.
Modify: `src/pages/Referrals.tsx` (tabs), `services/referralService.ts`, `hooks/useReferrals.ts`, `types/referral.ts`, `pages/Users.tsx` + `components/UsersTable.tsx` (wallet), `pages/Orders.tsx` + `components/OrdersTable.tsx` + `types/order.ts` + `services/orderService.ts` (price breakdown), `pages/Dashboard.tsx` + `services/dashboardService.ts` (referral tile).

### 6.4 Website (`website/`)
Create: `_src/pages/invite.html` and `assets/js/invite.js` (shows the code, copy button, Play Store button with `referrer=<CODE>`), `noindex`.
Modify: `vercel.json` (rewrite `/r/:code` → `/invite`), page build config (`scripts/build.mjs` page list), `_src/pages/terms.html` and `mobile-app/src/screens/terms/TermsScreen.tsx` (referral and wallet terms: credit is not cash, non-transferable, abuse voids rewards), refund-policy note on credit and clawback.

### 6.5 Docs
Create `docs/referral-v2-changes.md` (deploy order, rollback, QA results). Update `docs/AUDIT_REPORT.md` statuses when done.

---

## 7. Preserving existing users, purchases, referral data and payments

- **No destructive DDL.** No `DROP TABLE/COLUMN`, no `TRUNCATE`, no rewrite of `profiles`, `orders`, `purchases`, `payments` or `referrals` rows beyond additive backfills (`list_price := amount`, `applied_via := 'legacy'`). Each migration runs a pre-flight and post-flight row-count check and aborts in one transaction if counts differ.
- **Old columns kept:** `reward_type`, `referrer_reward_value`, `referee_reward_value`, `qualify_on` stay in place (ignored by new code) so a rollback is a code revert, not a data restore.
- **Old app builds keep working:** `apply_referral_code`, `get_my_referrals`, `referral_settings` reads, `create-payment-session`, `pay` and `verify-payment` keep their request/response shapes (new fields are only added). An old build that buys something is still charged the correct final amount, because the server computes it.
- **Existing referral rows** keep their status; eligibility for a future reward is judged by whether the friend has a qualifying paid order and no reward yet, so a legacy row marked `qualified` at signup is not paid early and is not lost.
- **Existing purchases and payments are untouched.** Access checks (`purchases` and storage policies) are unchanged. `payments.amount` continues to record what was actually charged.
- **Accounting:** revenue reporting uses `orders.amount` (paid) and the new `list_price` / `referral_discount` / `wallet_applied` columns; the sum reconciles.
- **Rollback:** feature flag `referral_settings.enabled = false` hides the UI; a follow-up migration can drop only the new objects; nothing that existed before is removed.

---

## 8. Verification plan

- **SQL tests** (`tests/referral_v2_checks.sql`, in the style of `multi_course_checks.sql`): a normal user cannot execute `grant_razorpay_payment`, cannot edit their order's product or amount, cannot insert into `wallet_transactions`, cannot set a referral to `rewarded`; self-referral and shared-phone are rejected; a second friend purchase does not create a second reward; replaying the webhook or `verify-payment` does not duplicate a reward or debit; discount never takes the price below ₹1; wallet cap respected; a held wallet amount cannot be double-spent; legacy `qualified` rows are not paid early; old `apply_referral_code` callers get the same JSON shape.
- **Edge function harness** (extend `tests/delete-account-harness` pattern): `pay` returns an amount equal to `compute_checkout()` for a set of cases.
- **Razorpay test-mode run** with `ALLOW_TEST_MODE=true` on a staging project: full flow signup with code → summary → pay → reward appears; app-killed-mid-payment recovery still works; refund path reverses credit.
- **Manual QA:** Referral screen states (disabled / enabled / no referrals / has wallet), WhatsApp installed vs not, invalid/expired code messages, old app build against the new backend.

## 9. Rollout order

1. Apply the pending migrations to production; verify with the existing SQL tests. 
2. Migration 1 (security), then confirm with `security_grants_checks.sql`.
3. Migrations 2–4, then deploy edge functions (`pay`, `create-payment-session`, `verify-payment`, `validate-referral-code`).
4. Deploy the admin panel; keep the program **disabled**, enter values, review the preview.
5. Release the mobile build; raise `min_app_version` only if you want to retire old builds (not required).
6. Enable the program in the admin panel and monitor the Referrals and Wallet tabs.

**Rough effort:** database + functions ≈ 4–5 days, mobile ≈ 4–5 days, admin ≈ 2–3 days, website + terms ≈ 1 day, testing ≈ 2–3 days.

---

**Stopping here.** Please review the five decisions in §0 and reply **"approved"** (or with changes) before anything is implemented.
