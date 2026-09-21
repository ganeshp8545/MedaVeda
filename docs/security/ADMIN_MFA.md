# Admin MFA (AAL2)

Migration `20261001100000_admin_mfa_aal2.sql` makes `am_i_admin()` — the gate behind every admin RLS policy and RPC —
require an **AAL2** session (JWT claim `aal = 'aal2'`, set by Supabase Auth after a TOTP code) **when the switch is on**.
`send-push-notification` (which checks `public.admins` itself) applies the same rule.

The switch (`public.admin_settings.require_mfa`) ships **OFF**, so deploying does not lock anyone out. It can only be turned on
with `set_admin_mfa_required(true)`, which refuses while any admin has no *verified* factor. No API role can read or flip it.

Live status (2026-09-21): 3 admins, 0 verified factors, TOTP enrol+verify enabled in Auth. **Migration not yet applied; requirement OFF.**

## Owner sequence (do in this order)
1. Apply the migration: `supabase db push` (safe: behaviour unchanged, flag OFF). Redeploy the edge function:
   `supabase functions deploy send-push-notification`.
2. Deploy the admin panel build that contains the MFA step (see `ADMIN_PANEL_DEPLOYMENT.md`).
3. **Each admin** signs in to the panel. With no factor yet, the panel shows the enrolment screen: scan the QR with an authenticator
   app, enter the code, done. (Save the printed secret somewhere safe as a recovery path — Supabase has no backup codes.)
4. Confirm every admin is enrolled:
   `supabase db query --linked "select a.email, count(f.id) filter (where f.status='verified') from admins a left join auth.mfa_factors f on f.user_id=a.id group by 1"`
5. Switch it on: `supabase db query --linked "select public.set_admin_mfa_required(true)"` — errors and names any admin still missing a factor.
6. Verify: sign out, sign in — the panel must ask for the code; then confirm that an aal1 token gets `false` from `am_i_admin`.
7. **Break-glass** if an admin loses their authenticator: `supabase db query --linked "select public.set_admin_mfa_required(false)"`,
   delete their factor (Dashboard → Authentication → Users → user → Factors), have them re-enrol, switch back on.

## Tests
`supabase/tests/admin_mfa_checks.sql` (in `run-all.sh`/CI, 23 checks): admin without AAL2 → denied; admin with AAL2 → allowed; student and anonymous → denied;
forged `aal` values rejected; RLS writes follow the gate; clients cannot read/flip the switch; cannot enable while any admin lacks a verified factor
(an unverified factor does not count); break-glass off works. The panel's enrolment/challenge UI is `admin-panel/src/pages/Login.tsx` and has
**not** been exercised against live Auth (needs a real admin login + authenticator).

Not covered by the gate: `free_preview` content-access helpers read `public.admins` directly (an admin at AAL1 can read paid content, not modify anything).
