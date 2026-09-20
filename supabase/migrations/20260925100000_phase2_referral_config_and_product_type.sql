-- ============================================================================
-- PHASE 2 (1/3) — referral reward config + products.product_type
-- ============================================================================
-- Additive only. Nothing existing is dropped, renamed or rewritten.
--
--   * products.product_type: what the wallet rule keys on. Existing products are
--     backfilled to 'other' on purpose - wallet credit stays OFF for a product
--     until an admin tags it 'notes' / 'notes_bundle' in the admin panel. The
--     server never guesses from `scope` (a chapter/subject/year/bundle product
--     unlocks notes AND videos together).
--   * referral_settings: every reward number lives here and is edited from the
--     admin panel. Defaults mirror the launch rules, but `enabled` stays false.
--     The legacy columns (reward_type, referrer_reward_value,
--     referee_reward_value, qualify_on) are kept for old builds and no longer
--     read by any reward logic.
-- Idempotent.
begin;

-- ---------------------------------------------------------------------------
-- 1. products.product_type
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists product_type text not null default 'other';

alter table public.products drop constraint if exists products_product_type_check;
alter table public.products
  add constraint products_product_type_check
  check (product_type in ('notes', 'notes_bundle', 'video', 'other'));

-- ---------------------------------------------------------------------------
-- 2. referral_settings: reward config
-- ---------------------------------------------------------------------------
alter table public.referral_settings
  add column if not exists friend_discount_percent   numeric      not null default 10,
  add column if not exists friend_discount_max       numeric               default 100,   -- null = no cap
  add column if not exists referrer_credit_amount    numeric      not null default 50,
  add column if not exists credit_hold_days          integer      not null default 7,
  add column if not exists credit_expiry_days        integer,                           -- null = never expires
  add column if not exists wallet_max_percent        numeric      not null default 50,
  add column if not exists wallet_product_types      text[]       not null default array['notes', 'notes_bundle'],
  add column if not exists apply_window_days         integer      not null default 2,   -- code usable only right after signup
  add column if not exists checkout_expiry_minutes   integer      not null default 30,  -- unpaid order lifetime
  add column if not exists terms_url                 text;

alter table public.referral_settings drop constraint if exists referral_settings_phase2_ranges;
alter table public.referral_settings
  add constraint referral_settings_phase2_ranges check (
        friend_discount_percent between 0 and 100
    and (friend_discount_max is null or friend_discount_max >= 0)
    and referrer_credit_amount >= 0
    and credit_hold_days between 0 and 365
    and (credit_expiry_days is null or credit_expiry_days > 0)
    and wallet_max_percent between 0 and 100
    and apply_window_days between 1 and 30
    and checkout_expiry_minutes between 5 and 240
    and wallet_product_types <@ array['notes', 'notes_bundle', 'video', 'other']
  );

-- ---------------------------------------------------------------------------
-- 3. referrals: which order was the friend's first paid purchase
-- ---------------------------------------------------------------------------
alter table public.referrals
  add column if not exists first_order_id text;

create unique index if not exists referrals_first_order_unique
  on public.referrals (first_order_id) where first_order_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Self-check
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.referral_settings where id = true) then
    raise exception 'PHASE2 self-check: referral_settings row missing';
  end if;
  if exists (select 1 from public.products where product_type not in ('notes','notes_bundle','video','other')) then
    raise exception 'PHASE2 self-check: bad product_type';
  end if;
end;
$$;

commit;
