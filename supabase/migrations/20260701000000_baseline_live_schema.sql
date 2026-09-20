-- =============================================================================
-- BASELINE: objects that exist on the live database but in no other migration.
--
-- Source: docs/live-schema/live_schema.sql (schema-only pg_dump of production,
-- 2026-09-20), i.e. the state BEFORE any migration in this directory beyond
-- 20260718 / 20260721 / 20260801150000 was applied. This file is generated from
-- that dump (catalog -> SQL, guards added). Verified: applied twice to a restore of
-- that dump = zero schema change; applied first in a from-scratch rebuild = the
-- same end state as live + the rest of the chain (tables, functions, policies,
-- triggers, storage policies, grants); Phase 2 SQL suite 0 FAIL / 106 PASS on it.
--
-- Purpose: make a from-scratch rebuild (new Supabase project / local
-- `supabase db reset`) end up identical to live, and be a NO-OP on live.
--
--   * Every object is guarded (IF NOT EXISTS, or a catalog check), and nothing is
--     ever dropped, altered or overwritten - an object that already exists is left
--     exactly as it is, including if live has diverged from the dump since.
--   * Grants are additive only (never REVOKE).
--   * payment_sessions / payments / razorpay_webhook_events are included even though
--     20260718 / 20260801150000 also create them: live carries policies and grants on
--     them (payments_admin_read, payment_sessions_select_own, "Admins can view all
--     payments", ...) that no migration defines. Those migrations then no-op on them.
--   * Not included, because another migration already creates them: delete_my_account,
--     grant_razorpay_payment. handle_new_user() is included only so the
--     on_auth_user_created trigger has a target; 20260923100000 / 20260924130000
--     replace it.
--   * Limits: an EXISTING table is not altered (missing columns are not added), and
--     Storage bucket rows are data, not schema, so they are not created here - create
--     the `notes` and `thumbnails` buckets in the Dashboard / seed.sql.
--   * Requires the Supabase platform schemas (auth, storage, extensions) and roles
--     (anon, authenticated, service_role), which always exist on Supabase.
--
-- Sorts BEFORE every other migration. On live it changes nothing; mark it applied
-- with `supabase migration repair --status applied 20260701000000` (or push with
-- --include-all).
-- =============================================================================

create extension if not exists pgcrypto  with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- Guard helpers (session-local, vanish at disconnect).
create function pg_temp.bl_constraint(p_tbl regclass, p_name text, p_ddl text) returns void
language plpgsql as $f$
begin
  if not exists (select 1 from pg_constraint where conrelid = p_tbl and conname = p_name) then
    execute p_ddl;
  end if;
end $f$;

create function pg_temp.bl_policy(p_schema text, p_tbl text, p_name text, p_ddl text) returns void
language plpgsql as $f$
begin
  if not exists (select 1 from pg_policies where schemaname = p_schema and tablename = p_tbl and policyname = p_name) then
    execute p_ddl;
  end if;
end $f$;

create function pg_temp.bl_trigger(p_tbl regclass, p_name text, p_ddl text) returns void
language plpgsql as $f$
begin
  if not exists (select 1 from pg_trigger where tgrelid = p_tbl and tgname = p_name and not tgisinternal) then
    execute p_ddl;
  end if;
end $f$;

create function pg_temp.bl_function(p_sig text, p_ddl text) returns void
language plpgsql as $f$
begin
  if to_regprocedure(p_sig) is null then
    execute p_ddl;
  end if;
end $f$;

-- ---- 1. Tables ---------------------------------------------------------------

create table if not exists public.admins (
  email text not null,
  id uuid
);

create table if not exists public.analytics_events (
  id text default (gen_random_uuid())::text not null,
  name text not null,
  params jsonb default '{}'::jsonb not null,
  user_id uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.app_settings (
  id integer default 1 not null,
  app_name text default 'MedVeda'::text not null,
  support_email text,
  support_phone text,
  maintenance_mode boolean default false not null,
  terms_url text,
  privacy_url text,
  razorpay_key_id text
);

create table if not exists public.chapters (
  id text default (gen_random_uuid())::text not null,
  title text not null,
  year_id text not null,
  subject_id text not null,
  "order" integer default 1 not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.notes (
  id text default (gen_random_uuid())::text not null,
  title text not null,
  pdf_url text not null,
  chapter_id text not null,
  "order" integer default 1 not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.notifications (
  id text default (gen_random_uuid())::text not null,
  title text not null,
  body text not null,
  type text,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.orders (
  id text default (gen_random_uuid())::text not null,
  user_id uuid not null,
  product_id text not null,
  amount numeric(10,2) not null,
  status text default 'created'::text not null,
  razorpay_order_id text,
  razorpay_payment_id text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  scope text,
  chapter_id text,
  subject_id text,
  year_id text,
  year_ids text[]
);

create table if not exists public.payment_sessions (
  id uuid not null,
  order_id text not null,
  user_id uuid not null,
  product_id text not null,
  expires_at timestamp with time zone not null,
  used boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.payments (
  id uuid default gen_random_uuid() not null,
  order_id text not null,
  user_id uuid not null,
  product_id text,
  amount numeric not null,
  razorpay_order_id text not null,
  razorpay_payment_id text not null,
  status text default 'success'::text not null,
  verified_at timestamp with time zone default now() not null
);

create table if not exists public.products (
  id text default (gen_random_uuid())::text not null,
  title text not null,
  description text,
  scope text not null,
  price numeric(10,2) default 0 not null,
  thumbnail text,
  chapter_id text,
  subject_id text,
  year_id text,
  year_ids text[],
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  original_price numeric
);

create table if not exists public.profiles (
  id uuid not null,
  name text default ''::text not null,
  email text not null,
  phone text,
  photo_url text,
  blocked boolean default false not null,
  created_at timestamp with time zone default now() not null,
  college text,
  phone_normalized text
);

create table if not exists public.purchases (
  id text default (gen_random_uuid())::text not null,
  user_id uuid not null,
  order_id text,
  product_id text,
  product_title text,
  scope text not null,
  chapter_id text,
  subject_id text,
  year_id text,
  year_ids text[],
  amount numeric(10,2),
  status text default 'success'::text,
  created_at timestamp with time zone default now() not null,
  razorpay_order_id text
);

create table if not exists public.push_tokens (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  expo_push_token text not null,
  platform text not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.quiz_scores (
  id text default (gen_random_uuid())::text not null,
  user_id uuid not null,
  email text,
  subject_id text,
  subject_title text,
  test_id text,
  test_title text,
  score integer not null,
  total integer not null,
  percentage integer not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.quiz_tests (
  id text default (gen_random_uuid())::text not null,
  title text not null,
  subject_id text not null,
  year_id text not null,
  "order" integer default 1 not null,
  active boolean default true not null,
  questions jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.razorpay_webhook_events (
  event_id text not null,
  razorpay_payment_id text not null,
  event_type text not null,
  received_at timestamp with time zone default now() not null
);

create table if not exists public.subjects (
  id text default (gen_random_uuid())::text not null,
  title text not null,
  icon text,
  color text,
  year_id text not null,
  "order" integer default 1 not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.videos (
  id text default (gen_random_uuid())::text not null,
  title text not null,
  youtube_url text not null,
  subject_id text not null,
  year_id text not null,
  "order" integer default 1 not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.years (
  id text default (gen_random_uuid())::text not null,
  title text not null,
  icon text,
  color text,
  "order" integer default 1 not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null
);

-- ---- 2. Functions (created only if absent; existing ones are never replaced) --

select pg_temp.bl_function('public.am_i_admin()', $bl$
CREATE OR REPLACE FUNCTION public.am_i_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.admins where id = auth.uid());
$function$
$bl$);

select pg_temp.bl_function('public.debug_whoami()', $bl$
CREATE OR REPLACE FUNCTION public.debug_whoami()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object(
    'auth_uid', auth.uid(),
    'jwt_email', auth.jwt() ->> 'email',
    'admins_row_by_id', (select row_to_json(a) from public.admins a where a.id = auth.uid()),
    'admins_row_by_email', (select row_to_json(a) from public.admins a where a.email = auth.jwt() ->> 'email')
  );
$function$
$bl$);

select pg_temp.bl_function('public.is_admin()', $bl$
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (
    select 1 from public.admins
    where email = auth.jwt() ->> 'email'
  );
$function$
$bl$);

select pg_temp.bl_function('public.normalize_phone(text)', $bl$
CREATE OR REPLACE FUNCTION public.normalize_phone(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select case
    when input is null or btrim(input) = '' then null
    when regexp_replace(btrim(input), '[[:space:]().-]', '', 'g') ~ '^00[1-9][0-9]{7,14}$'
      then '+' || substr(regexp_replace(btrim(input), '[[:space:]().-]', '', 'g'), 3)
    when regexp_replace(btrim(input), '[[:space:]().-]', '', 'g') ~ '^\+[1-9][0-9]{7,14}$'
      then regexp_replace(btrim(input), '[[:space:]().-]', '', 'g')
    else null
  end;
$function$
$bl$);

select pg_temp.bl_function('public.rls_auto_enable()', $bl$
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
$bl$);

select pg_temp.bl_function('public.sync_profile_phone_normalized()', $bl$
CREATE OR REPLACE FUNCTION public.sync_profile_phone_normalized()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.phone_normalized := public.normalize_phone(new.phone);
  if (tg_op = 'INSERT' or new.phone is distinct from old.phone)
    and new.phone is not null
    and btrim(new.phone) <> ''
    and new.phone_normalized is null then
    raise exception 'phone must be a valid E.164 number';
  end if;
  return new;
end;
$function$
$bl$);

select pg_temp.bl_function('public.handle_new_user()', $bl$
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$function$
$bl$);

-- ---- 3. Constraints (primary/unique/check first, foreign keys last) -----------

select pg_temp.bl_constraint('public.admins', 'admins_pkey',
  'alter table public.admins add constraint admins_pkey ' || $bl$PRIMARY KEY (email)$bl$);

select pg_temp.bl_constraint('public.analytics_events', 'analytics_events_pkey',
  'alter table public.analytics_events add constraint analytics_events_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.app_settings', 'app_settings_pkey',
  'alter table public.app_settings add constraint app_settings_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.chapters', 'chapters_pkey',
  'alter table public.chapters add constraint chapters_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.notes', 'notes_pkey',
  'alter table public.notes add constraint notes_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.notifications', 'notifications_pkey',
  'alter table public.notifications add constraint notifications_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.orders', 'orders_pkey',
  'alter table public.orders add constraint orders_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.payment_sessions', 'payment_sessions_pkey',
  'alter table public.payment_sessions add constraint payment_sessions_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.payments', 'payments_pkey',
  'alter table public.payments add constraint payments_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.products', 'products_pkey',
  'alter table public.products add constraint products_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.profiles', 'profiles_pkey',
  'alter table public.profiles add constraint profiles_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.purchases', 'purchases_pkey',
  'alter table public.purchases add constraint purchases_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.push_tokens', 'push_tokens_pkey',
  'alter table public.push_tokens add constraint push_tokens_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.quiz_scores', 'quiz_scores_pkey',
  'alter table public.quiz_scores add constraint quiz_scores_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.quiz_tests', 'quiz_tests_pkey',
  'alter table public.quiz_tests add constraint quiz_tests_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.razorpay_webhook_events', 'razorpay_webhook_events_pkey',
  'alter table public.razorpay_webhook_events add constraint razorpay_webhook_events_pkey ' || $bl$PRIMARY KEY (event_id)$bl$);

select pg_temp.bl_constraint('public.subjects', 'subjects_pkey',
  'alter table public.subjects add constraint subjects_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.videos', 'videos_pkey',
  'alter table public.videos add constraint videos_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.years', 'years_pkey',
  'alter table public.years add constraint years_pkey ' || $bl$PRIMARY KEY (id)$bl$);

select pg_temp.bl_constraint('public.admins', 'admins_id_key',
  'alter table public.admins add constraint admins_id_key ' || $bl$UNIQUE (id)$bl$);

select pg_temp.bl_constraint('public.payments', 'payments_razorpay_payment_id_key',
  'alter table public.payments add constraint payments_razorpay_payment_id_key ' || $bl$UNIQUE (razorpay_payment_id)$bl$);

select pg_temp.bl_constraint('public.push_tokens', 'push_tokens_expo_push_token_key',
  'alter table public.push_tokens add constraint push_tokens_expo_push_token_key ' || $bl$UNIQUE (expo_push_token)$bl$);

select pg_temp.bl_constraint('public.app_settings', 'single_row',
  'alter table public.app_settings add constraint single_row ' || $bl$CHECK ((id = 1))$bl$);

select pg_temp.bl_constraint('public.orders', 'orders_status_check',
  'alter table public.orders add constraint orders_status_check ' || $bl$CHECK ((status = ANY (ARRAY['created'::text, 'paid'::text, 'failed'::text, 'cancelled'::text, 'pending'::text, 'refunded'::text])))$bl$);

select pg_temp.bl_constraint('public.products', 'original_price_gte_price',
  'alter table public.products add constraint original_price_gte_price ' || $bl$CHECK (((original_price IS NULL) OR (original_price >= price)))$bl$);

select pg_temp.bl_constraint('public.products', 'products_scope_check',
  'alter table public.products add constraint products_scope_check ' || $bl$CHECK ((scope = ANY (ARRAY['chapter'::text, 'subject'::text, 'year'::text, 'bundle'::text])))$bl$);

select pg_temp.bl_constraint('public.purchases', 'purchases_scope_check',
  'alter table public.purchases add constraint purchases_scope_check ' || $bl$CHECK ((scope = ANY (ARRAY['chapter'::text, 'subject'::text, 'year'::text, 'bundle'::text])))$bl$);

select pg_temp.bl_constraint('public.push_tokens', 'push_tokens_platform_check',
  'alter table public.push_tokens add constraint push_tokens_platform_check ' || $bl$CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])))$bl$);

select pg_temp.bl_constraint('public.admins', 'admins_id_fkey',
  'alter table public.admins add constraint admins_id_fkey ' || $bl$FOREIGN KEY (id) REFERENCES auth.users(id)$bl$);

select pg_temp.bl_constraint('public.analytics_events', 'analytics_events_user_id_fkey',
  'alter table public.analytics_events add constraint analytics_events_user_id_fkey ' || $bl$FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL$bl$);

select pg_temp.bl_constraint('public.chapters', 'chapters_subject_id_fkey',
  'alter table public.chapters add constraint chapters_subject_id_fkey ' || $bl$FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.chapters', 'chapters_year_id_fkey',
  'alter table public.chapters add constraint chapters_year_id_fkey ' || $bl$FOREIGN KEY (year_id) REFERENCES years(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.notes', 'notes_chapter_id_fkey',
  'alter table public.notes add constraint notes_chapter_id_fkey ' || $bl$FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.orders', 'orders_product_id_fkey',
  'alter table public.orders add constraint orders_product_id_fkey ' || $bl$FOREIGN KEY (product_id) REFERENCES products(id)$bl$);

select pg_temp.bl_constraint('public.orders', 'orders_user_id_fkey',
  'alter table public.orders add constraint orders_user_id_fkey ' || $bl$FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.payment_sessions', 'payment_sessions_order_id_fkey',
  'alter table public.payment_sessions add constraint payment_sessions_order_id_fkey ' || $bl$FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.payment_sessions', 'payment_sessions_product_id_fkey',
  'alter table public.payment_sessions add constraint payment_sessions_product_id_fkey ' || $bl$FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.payment_sessions', 'payment_sessions_user_id_fkey',
  'alter table public.payment_sessions add constraint payment_sessions_user_id_fkey ' || $bl$FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.payments', 'payments_order_id_fkey',
  'alter table public.payments add constraint payments_order_id_fkey ' || $bl$FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.payments', 'payments_product_id_fkey',
  'alter table public.payments add constraint payments_product_id_fkey ' || $bl$FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL$bl$);

select pg_temp.bl_constraint('public.payments', 'payments_user_id_fkey',
  'alter table public.payments add constraint payments_user_id_fkey ' || $bl$FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.products', 'products_chapter_id_fkey',
  'alter table public.products add constraint products_chapter_id_fkey ' || $bl$FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL$bl$);

select pg_temp.bl_constraint('public.products', 'products_subject_id_fkey',
  'alter table public.products add constraint products_subject_id_fkey ' || $bl$FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL$bl$);

select pg_temp.bl_constraint('public.products', 'products_year_id_fkey',
  'alter table public.products add constraint products_year_id_fkey ' || $bl$FOREIGN KEY (year_id) REFERENCES years(id) ON DELETE SET NULL$bl$);

select pg_temp.bl_constraint('public.profiles', 'profiles_id_fkey',
  'alter table public.profiles add constraint profiles_id_fkey ' || $bl$FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.purchases', 'purchases_chapter_id_fkey',
  'alter table public.purchases add constraint purchases_chapter_id_fkey ' || $bl$FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL$bl$);

select pg_temp.bl_constraint('public.purchases', 'purchases_order_id_fkey',
  'alter table public.purchases add constraint purchases_order_id_fkey ' || $bl$FOREIGN KEY (order_id) REFERENCES orders(id)$bl$);

select pg_temp.bl_constraint('public.purchases', 'purchases_product_id_fkey',
  'alter table public.purchases add constraint purchases_product_id_fkey ' || $bl$FOREIGN KEY (product_id) REFERENCES products(id)$bl$);

select pg_temp.bl_constraint('public.purchases', 'purchases_subject_id_fkey',
  'alter table public.purchases add constraint purchases_subject_id_fkey ' || $bl$FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL$bl$);

select pg_temp.bl_constraint('public.purchases', 'purchases_user_id_fkey',
  'alter table public.purchases add constraint purchases_user_id_fkey ' || $bl$FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.purchases', 'purchases_year_id_fkey',
  'alter table public.purchases add constraint purchases_year_id_fkey ' || $bl$FOREIGN KEY (year_id) REFERENCES years(id) ON DELETE SET NULL$bl$);

select pg_temp.bl_constraint('public.push_tokens', 'push_tokens_user_id_fkey',
  'alter table public.push_tokens add constraint push_tokens_user_id_fkey ' || $bl$FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.quiz_scores', 'quiz_scores_subject_id_fkey',
  'alter table public.quiz_scores add constraint quiz_scores_subject_id_fkey ' || $bl$FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL$bl$);

select pg_temp.bl_constraint('public.quiz_scores', 'quiz_scores_test_id_fkey',
  'alter table public.quiz_scores add constraint quiz_scores_test_id_fkey ' || $bl$FOREIGN KEY (test_id) REFERENCES quiz_tests(id) ON DELETE SET NULL$bl$);

select pg_temp.bl_constraint('public.quiz_scores', 'quiz_scores_user_id_fkey',
  'alter table public.quiz_scores add constraint quiz_scores_user_id_fkey ' || $bl$FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.quiz_tests', 'quiz_tests_subject_id_fkey',
  'alter table public.quiz_tests add constraint quiz_tests_subject_id_fkey ' || $bl$FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.quiz_tests', 'quiz_tests_year_id_fkey',
  'alter table public.quiz_tests add constraint quiz_tests_year_id_fkey ' || $bl$FOREIGN KEY (year_id) REFERENCES years(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.subjects', 'subjects_year_id_fkey',
  'alter table public.subjects add constraint subjects_year_id_fkey ' || $bl$FOREIGN KEY (year_id) REFERENCES years(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.videos', 'videos_subject_id_fkey',
  'alter table public.videos add constraint videos_subject_id_fkey ' || $bl$FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE$bl$);

select pg_temp.bl_constraint('public.videos', 'videos_year_id_fkey',
  'alter table public.videos add constraint videos_year_id_fkey ' || $bl$FOREIGN KEY (year_id) REFERENCES years(id) ON DELETE CASCADE$bl$);

-- ---- 4. Indexes ---------------------------------------------------------------

CREATE INDEX IF NOT EXISTS chapters_subject_id_idx ON public.chapters USING btree (subject_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens USING btree (user_id);
CREATE INDEX IF NOT EXISTS notes_chapter_id_idx ON public.notes USING btree (chapter_id) WHERE (active = true);
CREATE UNIQUE INDEX IF NOT EXISTS orders_razorpay_order_id_unique ON public.orders USING btree (razorpay_order_id);
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON public.orders USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_razorpay_payment_id_unique ON public.payments USING btree (razorpay_payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_normalized_unique ON public.profiles USING btree (phone_normalized) WHERE (phone_normalized IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS purchases_order_id_unique ON public.purchases USING btree (order_id);
CREATE INDEX IF NOT EXISTS quiz_scores_user_id_idx ON public.quiz_scores USING btree (user_id);
CREATE INDEX IF NOT EXISTS quiz_tests_subject_id_idx ON public.quiz_tests USING btree (subject_id) WHERE (active = true);
CREATE INDEX IF NOT EXISTS subjects_year_id_idx ON public.subjects USING btree (year_id);
CREATE INDEX IF NOT EXISTS videos_subject_id_idx ON public.videos USING btree (subject_id) WHERE (active = true);

-- ---- 5. Row level security ----------------------------------------------------

alter table public.admins enable row level security;
alter table public.analytics_events enable row level security;
alter table public.app_settings enable row level security;
alter table public.chapters enable row level security;
alter table public.notes enable row level security;
alter table public.notifications enable row level security;
alter table public.orders enable row level security;
alter table public.payment_sessions enable row level security;
alter table public.payments enable row level security;
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.purchases enable row level security;
alter table public.push_tokens enable row level security;
alter table public.quiz_scores enable row level security;
alter table public.quiz_tests enable row level security;
alter table public.razorpay_webhook_events enable row level security;
alter table public.subjects enable row level security;
alter table public.videos enable row level security;
alter table public.years enable row level security;

-- ---- 6. Policies (public tables + the Storage policies on storage.objects) ----

select pg_temp.bl_policy('public', 'admins', 'admins_admin_only', $bl$
create policy "admins_admin_only" on public.admins for all to public
  using (am_i_admin())
  with check (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'analytics_events', 'anyone can log analytics events', $bl$
create policy "anyone can log analytics events" on public.analytics_events for insert to public
  with check (true)
$bl$);

select pg_temp.bl_policy('public', 'app_settings', 'admin write app_settings', $bl$
create policy "admin write app_settings" on public.app_settings for update to public
  using (is_admin())
$bl$);

select pg_temp.bl_policy('public', 'app_settings', 'public read app_settings', $bl$
create policy "public read app_settings" on public.app_settings for select to public
  using ((auth.uid() IS NOT NULL))
$bl$);

select pg_temp.bl_policy('public', 'chapters', 'admin write chapters', $bl$
create policy "admin write chapters" on public.chapters for all to public
  using (is_admin())
  with check (is_admin())
$bl$);

select pg_temp.bl_policy('public', 'chapters', 'chapters_admin_write', $bl$
create policy "chapters_admin_write" on public.chapters for all to public
  using (am_i_admin())
  with check (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'chapters', 'chapters_public_read_active', $bl$
create policy "chapters_public_read_active" on public.chapters for select to public
  using (((active = true) OR am_i_admin()))
$bl$);

select pg_temp.bl_policy('public', 'chapters', 'public read active chapters', $bl$
create policy "public read active chapters" on public.chapters for select to public
  using (((auth.uid() IS NOT NULL) AND ((active = true) OR is_admin())))
$bl$);

select pg_temp.bl_policy('public', 'notes', 'Admin can manage notes', $bl$
create policy "Admin can manage notes" on public.notes for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins
  WHERE (admins.email = (auth.jwt() ->> 'email'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM admins
  WHERE (admins.email = (auth.jwt() ->> 'email'::text)))))
$bl$);

select pg_temp.bl_policy('public', 'notes', 'Authenticated users can read notes', $bl$
create policy "Authenticated users can read notes" on public.notes for select to authenticated
  using ((auth.uid() IS NOT NULL))
$bl$);

select pg_temp.bl_policy('public', 'notes', 'notes_admin_write', $bl$
create policy "notes_admin_write" on public.notes for all to public
  using (am_i_admin())
  with check (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'notes', 'notes_public_read_active', $bl$
create policy "notes_public_read_active" on public.notes for select to public
  using (((active = true) OR am_i_admin()))
$bl$);

select pg_temp.bl_policy('public', 'notes', 'read notes', $bl$
create policy "read notes" on public.notes for select to public
  using (((auth.uid() IS NOT NULL) AND ((active = true) OR is_admin())))
$bl$);

select pg_temp.bl_policy('public', 'notifications', 'admin write notifications', $bl$
create policy "admin write notifications" on public.notifications for all to public
  using (is_admin())
  with check (is_admin())
$bl$);

select pg_temp.bl_policy('public', 'notifications', 'notifications_admin_write', $bl$
create policy "notifications_admin_write" on public.notifications for all to public
  using (am_i_admin())
  with check (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'notifications', 'notifications_public_read_active', $bl$
create policy "notifications_public_read_active" on public.notifications for select to public
  using (((active = true) OR am_i_admin()))
$bl$);

select pg_temp.bl_policy('public', 'notifications', 'public read active notifications', $bl$
create policy "public read active notifications" on public.notifications for select to public
  using (((auth.uid() IS NOT NULL) AND ((active = true) OR is_admin())))
$bl$);

select pg_temp.bl_policy('public', 'orders', 'Admins can update all orders', $bl$
create policy "Admins can update all orders" on public.orders for update to public
  using (am_i_admin())
  with check (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'orders', 'Admins can view all orders', $bl$
create policy "Admins can view all orders" on public.orders for select to public
  using (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'orders', 'Users can cancel own pending orders', $bl$
create policy "Users can cancel own pending orders" on public.orders for update to public
  using ((auth.uid() = user_id))
  with check (((auth.uid() = user_id) AND (status <> 'paid'::text)))
$bl$);

select pg_temp.bl_policy('public', 'orders', 'Users can create own orders', $bl$
create policy "Users can create own orders" on public.orders for insert to public
  with check (((auth.uid() = user_id) AND (status = 'created'::text)))
$bl$);

select pg_temp.bl_policy('public', 'orders', 'Users can view own orders', $bl$
create policy "Users can view own orders" on public.orders for select to public
  using ((auth.uid() = user_id))
$bl$);

select pg_temp.bl_policy('public', 'orders', 'admin update orders', $bl$
create policy "admin update orders" on public.orders for update to public
  using (is_admin())
$bl$);

select pg_temp.bl_policy('public', 'orders', 'orders_admin_write', $bl$
create policy "orders_admin_write" on public.orders for all to public
  using (am_i_admin())
  with check (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'orders', 'orders_insert_own', $bl$
create policy "orders_insert_own" on public.orders for insert to public
  with check ((user_id = auth.uid()))
$bl$);

select pg_temp.bl_policy('public', 'orders', 'orders_select_own_or_admin', $bl$
create policy "orders_select_own_or_admin" on public.orders for select to public
  using (((user_id = auth.uid()) OR am_i_admin()))
$bl$);

select pg_temp.bl_policy('public', 'orders', 'user read own orders', $bl$
create policy "user read own orders" on public.orders for select to public
  using (((user_id = auth.uid()) OR is_admin()))
$bl$);

select pg_temp.bl_policy('public', 'payment_sessions', 'payment_sessions_select_own', $bl$
create policy "payment_sessions_select_own" on public.payment_sessions for select to public
  using (((user_id = auth.uid()) OR am_i_admin()))
$bl$);

select pg_temp.bl_policy('public', 'payments', 'Admins can view all payments', $bl$
create policy "Admins can view all payments" on public.payments for select to public
  using (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'payments', 'Users can view own payments', $bl$
create policy "Users can view own payments" on public.payments for select to public
  using ((auth.uid() = user_id))
$bl$);

select pg_temp.bl_policy('public', 'payments', 'payments_admin_read', $bl$
create policy "payments_admin_read" on public.payments for select to public
  using (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'products', 'admin write products', $bl$
create policy "admin write products" on public.products for all to public
  using (is_admin())
  with check (is_admin())
$bl$);

select pg_temp.bl_policy('public', 'products', 'products_admin_write', $bl$
create policy "products_admin_write" on public.products for all to public
  using (am_i_admin())
  with check (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'products', 'products_public_read_active', $bl$
create policy "products_public_read_active" on public.products for select to public
  using (((active = true) OR am_i_admin()))
$bl$);

select pg_temp.bl_policy('public', 'products', 'public read active products', $bl$
create policy "public read active products" on public.products for select to public
  using (((auth.uid() IS NOT NULL) AND ((active = true) OR is_admin())))
$bl$);

select pg_temp.bl_policy('public', 'profiles', 'admin manage profiles', $bl$
create policy "admin manage profiles" on public.profiles for all to public
  using (is_admin())
$bl$);

select pg_temp.bl_policy('public', 'profiles', 'profiles_admin_all', $bl$
create policy "profiles_admin_all" on public.profiles for all to public
  using (am_i_admin())
  with check (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'profiles', 'profiles_select_own_or_admin', $bl$
create policy "profiles_select_own_or_admin" on public.profiles for select to public
  using (((id = auth.uid()) OR am_i_admin()))
$bl$);

select pg_temp.bl_policy('public', 'profiles', 'profiles_update_own_or_admin', $bl$
create policy "profiles_update_own_or_admin" on public.profiles for update to public
  using (((id = auth.uid()) OR am_i_admin()))
$bl$);

select pg_temp.bl_policy('public', 'profiles', 'user read own profile', $bl$
create policy "user read own profile" on public.profiles for select to public
  using (((id = auth.uid()) OR is_admin()))
$bl$);

select pg_temp.bl_policy('public', 'profiles', 'user update own profile', $bl$
create policy "user update own profile" on public.profiles for update to public
  using ((id = auth.uid()))
  with check (((id = auth.uid()) AND (blocked = ( SELECT profiles_1.blocked
   FROM profiles profiles_1
  WHERE (profiles_1.id = auth.uid())))))
$bl$);

select pg_temp.bl_policy('public', 'purchases', 'Admins can view all purchases', $bl$
create policy "Admins can view all purchases" on public.purchases for select to public
  using (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'purchases', 'Users can view own purchases', $bl$
create policy "Users can view own purchases" on public.purchases for select to public
  using ((auth.uid() = user_id))
$bl$);

select pg_temp.bl_policy('public', 'purchases', 'purchases_admin_write', $bl$
create policy "purchases_admin_write" on public.purchases for all to public
  using (am_i_admin())
  with check (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'purchases', 'purchases_select_own_or_admin', $bl$
create policy "purchases_select_own_or_admin" on public.purchases for select to public
  using (((user_id = auth.uid()) OR am_i_admin()))
$bl$);

select pg_temp.bl_policy('public', 'purchases', 'user read own purchases', $bl$
create policy "user read own purchases" on public.purchases for select to public
  using (((user_id = auth.uid()) OR is_admin()))
$bl$);

select pg_temp.bl_policy('public', 'push_tokens', 'Users manage their own push tokens', $bl$
create policy "Users manage their own push tokens" on public.push_tokens for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id))
$bl$);

select pg_temp.bl_policy('public', 'push_tokens', 'push_tokens_own', $bl$
create policy "push_tokens_own" on public.push_tokens for all to public
  using (((user_id = auth.uid()) OR am_i_admin()))
  with check (((user_id = auth.uid()) OR am_i_admin()))
$bl$);

select pg_temp.bl_policy('public', 'quiz_scores', 'quiz_scores_own_or_admin', $bl$
create policy "quiz_scores_own_or_admin" on public.quiz_scores for all to public
  using (((user_id = auth.uid()) OR am_i_admin()))
  with check (((user_id = auth.uid()) OR am_i_admin()))
$bl$);

select pg_temp.bl_policy('public', 'quiz_scores', 'user read own quiz_scores', $bl$
create policy "user read own quiz_scores" on public.quiz_scores for select to public
  using (((user_id = auth.uid()) OR is_admin()))
$bl$);

select pg_temp.bl_policy('public', 'quiz_scores', 'user write own quiz_scores', $bl$
create policy "user write own quiz_scores" on public.quiz_scores for insert to public
  with check ((user_id = auth.uid()))
$bl$);

select pg_temp.bl_policy('public', 'quiz_tests', 'admin write quiz_tests', $bl$
create policy "admin write quiz_tests" on public.quiz_tests for all to public
  using (is_admin())
  with check (is_admin())
$bl$);

select pg_temp.bl_policy('public', 'quiz_tests', 'public read active quiz_tests', $bl$
create policy "public read active quiz_tests" on public.quiz_tests for select to public
  using (((auth.uid() IS NOT NULL) AND ((active = true) OR is_admin())))
$bl$);

select pg_temp.bl_policy('public', 'quiz_tests', 'quiz_tests_admin_write', $bl$
create policy "quiz_tests_admin_write" on public.quiz_tests for all to public
  using (am_i_admin())
  with check (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'quiz_tests', 'quiz_tests_public_read_active', $bl$
create policy "quiz_tests_public_read_active" on public.quiz_tests for select to public
  using (((active = true) OR am_i_admin()))
$bl$);

select pg_temp.bl_policy('public', 'subjects', 'admin write subjects', $bl$
create policy "admin write subjects" on public.subjects for all to public
  using (is_admin())
  with check (is_admin())
$bl$);

select pg_temp.bl_policy('public', 'subjects', 'public read active subjects', $bl$
create policy "public read active subjects" on public.subjects for select to public
  using (((auth.uid() IS NOT NULL) AND ((active = true) OR is_admin())))
$bl$);

select pg_temp.bl_policy('public', 'subjects', 'subjects_admin_write', $bl$
create policy "subjects_admin_write" on public.subjects for all to public
  using (am_i_admin())
  with check (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'subjects', 'subjects_public_read_active', $bl$
create policy "subjects_public_read_active" on public.subjects for select to public
  using (((active = true) OR am_i_admin()))
$bl$);

select pg_temp.bl_policy('public', 'videos', 'admin write videos', $bl$
create policy "admin write videos" on public.videos for all to public
  using (is_admin())
  with check (is_admin())
$bl$);

select pg_temp.bl_policy('public', 'videos', 'public read active videos', $bl$
create policy "public read active videos" on public.videos for select to public
  using (((auth.uid() IS NOT NULL) AND ((active = true) OR is_admin())))
$bl$);

select pg_temp.bl_policy('public', 'videos', 'videos_admin_write', $bl$
create policy "videos_admin_write" on public.videos for all to public
  using (am_i_admin())
  with check (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'videos', 'videos_public_read_active', $bl$
create policy "videos_public_read_active" on public.videos for select to public
  using (((active = true) OR am_i_admin()))
$bl$);

select pg_temp.bl_policy('public', 'years', 'admin write years', $bl$
create policy "admin write years" on public.years for all to public
  using (is_admin())
  with check (is_admin())
$bl$);

select pg_temp.bl_policy('public', 'years', 'public read active years', $bl$
create policy "public read active years" on public.years for select to public
  using (((auth.uid() IS NOT NULL) AND ((active = true) OR is_admin())))
$bl$);

select pg_temp.bl_policy('public', 'years', 'years_admin_write', $bl$
create policy "years_admin_write" on public.years for all to public
  using (am_i_admin())
  with check (am_i_admin())
$bl$);

select pg_temp.bl_policy('public', 'years', 'years_public_read_active', $bl$
create policy "years_public_read_active" on public.years for select to public
  using (((active = true) OR am_i_admin()))
$bl$);

select pg_temp.bl_policy('storage', 'objects', 'admin delete notes/thumbnails', $bl$
create policy "admin delete notes/thumbnails" on storage.objects for delete to public
  using (((bucket_id = ANY (ARRAY['notes'::text, 'thumbnails'::text])) AND is_admin()))
$bl$);

select pg_temp.bl_policy('storage', 'objects', 'admin update notes/thumbnails', $bl$
create policy "admin update notes/thumbnails" on storage.objects for update to public
  using (((bucket_id = ANY (ARRAY['notes'::text, 'thumbnails'::text])) AND is_admin()))
  with check (((bucket_id = ANY (ARRAY['notes'::text, 'thumbnails'::text])) AND is_admin()))
$bl$);

select pg_temp.bl_policy('storage', 'objects', 'admin upload notes/thumbnails', $bl$
create policy "admin upload notes/thumbnails" on storage.objects for insert to public
  with check (((bucket_id = ANY (ARRAY['notes'::text, 'thumbnails'::text])) AND is_admin()))
$bl$);

select pg_temp.bl_policy('storage', 'objects', 'notes_admin_write', $bl$
create policy "notes_admin_write" on storage.objects for all to public
  using (((bucket_id = 'notes'::text) AND am_i_admin()))
  with check (((bucket_id = 'notes'::text) AND am_i_admin()))
$bl$);

select pg_temp.bl_policy('storage', 'objects', 'notes_read_if_purchased', $bl$
create policy "notes_read_if_purchased" on storage.objects for select to public
  using (((bucket_id = 'notes'::text) AND (am_i_admin() OR (EXISTS ( SELECT 1
   FROM ((notes n
     JOIN chapters c ON ((c.id = n.chapter_id)))
     JOIN purchases p ON ((p.user_id = auth.uid())))
  WHERE ((POSITION((objects.name) IN (n.pdf_url)) > 0) AND (((p.scope = 'chapter'::text) AND (p.chapter_id = c.id)) OR ((p.scope = 'subject'::text) AND (p.subject_id = c.subject_id)) OR ((p.scope = 'year'::text) AND (p.year_id = c.year_id)) OR ((p.scope = 'bundle'::text) AND (c.year_id = ANY (p.year_ids))))))))))
$bl$);

select pg_temp.bl_policy('storage', 'objects', 'public read notes/thumbnails', $bl$
create policy "public read notes/thumbnails" on storage.objects for select to public
  using ((bucket_id = ANY (ARRAY['notes'::text, 'thumbnails'::text])))
$bl$);

-- ---- 7. Triggers -------------------------------------------------------------

select pg_temp.bl_trigger('auth.users', 'on_auth_user_created', $bl$CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()$bl$);

select pg_temp.bl_trigger('public.profiles', 'profiles_sync_phone_normalized', $bl$CREATE TRIGGER profiles_sync_phone_normalized BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_profile_phone_normalized()$bl$);

-- ---- 8. Event trigger: auto-enable RLS on new public tables (live behaviour) ----
-- Event triggers need superuser; skip with a notice where the role cannot create one.
do $bl$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  end if;
exception when insufficient_privilege then
  raise notice 'baseline: cannot create event trigger ensure_rls (insufficient privilege); skipped';
end $bl$;

-- ---- 9. Grants (additive only) -----------------------------------------------

grant EXECUTE on function public.am_i_admin() to anon;
grant EXECUTE on function public.am_i_admin() to authenticated;
grant EXECUTE on function public.am_i_admin() to public;
grant EXECUTE on function public.am_i_admin() to service_role;
grant EXECUTE on function public.debug_whoami() to anon;
grant EXECUTE on function public.debug_whoami() to authenticated;
grant EXECUTE on function public.debug_whoami() to public;
grant EXECUTE on function public.debug_whoami() to service_role;
grant EXECUTE on function public.handle_new_user() to anon;
grant EXECUTE on function public.handle_new_user() to authenticated;
grant EXECUTE on function public.handle_new_user() to public;
grant EXECUTE on function public.handle_new_user() to service_role;
grant EXECUTE on function public.is_admin() to anon;
grant EXECUTE on function public.is_admin() to authenticated;
grant EXECUTE on function public.is_admin() to public;
grant EXECUTE on function public.is_admin() to service_role;
grant EXECUTE on function public.normalize_phone(text) to anon;
grant EXECUTE on function public.normalize_phone(text) to authenticated;
grant EXECUTE on function public.normalize_phone(text) to public;
grant EXECUTE on function public.normalize_phone(text) to service_role;
grant EXECUTE on function public.rls_auto_enable() to anon;
grant EXECUTE on function public.rls_auto_enable() to authenticated;
grant EXECUTE on function public.rls_auto_enable() to public;
grant EXECUTE on function public.rls_auto_enable() to service_role;
grant EXECUTE on function public.sync_profile_phone_normalized() to anon;
grant EXECUTE on function public.sync_profile_phone_normalized() to authenticated;
grant EXECUTE on function public.sync_profile_phone_normalized() to public;
grant EXECUTE on function public.sync_profile_phone_normalized() to service_role;
grant SELECT, DELETE, INSERT, TRUNCATE, MAINTAIN, REFERENCES, TRIGGER, UPDATE on table public.admins to anon;
grant MAINTAIN, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, SELECT on table public.admins to authenticated;
grant TRUNCATE, MAINTAIN, TRIGGER, REFERENCES, DELETE, UPDATE, SELECT, INSERT on table public.admins to service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, INSERT, SELECT, UPDATE, DELETE on table public.analytics_events to anon;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, INSERT, SELECT, UPDATE, DELETE on table public.analytics_events to authenticated;
grant TRUNCATE, UPDATE, SELECT, INSERT, MAINTAIN, TRIGGER, REFERENCES, DELETE on table public.analytics_events to service_role;
grant INSERT, SELECT, DELETE, UPDATE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table public.app_settings to anon;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, INSERT, SELECT, UPDATE, DELETE on table public.app_settings to authenticated;
grant TRIGGER, MAINTAIN, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT on table public.app_settings to service_role;
grant DELETE, UPDATE, SELECT, INSERT, MAINTAIN, TRIGGER, REFERENCES, TRUNCATE on table public.chapters to anon;
grant TRUNCATE, UPDATE, SELECT, INSERT, MAINTAIN, TRIGGER, REFERENCES, DELETE on table public.chapters to authenticated;
grant TRUNCATE, UPDATE, SELECT, INSERT, MAINTAIN, TRIGGER, REFERENCES, DELETE on table public.chapters to service_role;
grant TRUNCATE, UPDATE, SELECT, INSERT, DELETE, REFERENCES, TRIGGER, MAINTAIN on table public.notes to anon;
grant MAINTAIN, TRIGGER, REFERENCES, TRUNCATE, INSERT, DELETE, UPDATE, SELECT on table public.notes to authenticated;
grant TRUNCATE, INSERT, SELECT, UPDATE, DELETE, REFERENCES, TRIGGER, MAINTAIN on table public.notes to service_role;
grant INSERT, MAINTAIN, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT on table public.notifications to anon;
grant SELECT, MAINTAIN, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT on table public.notifications to authenticated;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, INSERT, SELECT, UPDATE, DELETE on table public.notifications to service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, INSERT, SELECT, UPDATE, DELETE on table public.orders to anon;
grant TRUNCATE, UPDATE, SELECT, INSERT, MAINTAIN, TRIGGER, REFERENCES, DELETE on table public.orders to authenticated;
grant INSERT, SELECT, DELETE, UPDATE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table public.orders to service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, INSERT, SELECT, UPDATE, DELETE on table public.payment_sessions to anon;
grant TRIGGER, MAINTAIN, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT on table public.payment_sessions to authenticated;
grant DELETE, UPDATE, SELECT, INSERT, MAINTAIN, TRIGGER, REFERENCES, TRUNCATE on table public.payment_sessions to service_role;
grant TRUNCATE, UPDATE, SELECT, INSERT, MAINTAIN, TRIGGER, REFERENCES, DELETE on table public.payments to anon;
grant TRUNCATE, UPDATE, SELECT, INSERT, MAINTAIN, TRIGGER, REFERENCES, DELETE on table public.payments to authenticated;
grant TRUNCATE, UPDATE, SELECT, INSERT, DELETE, REFERENCES, TRIGGER, MAINTAIN on table public.payments to service_role;
grant MAINTAIN, TRIGGER, REFERENCES, TRUNCATE, INSERT, DELETE, UPDATE, SELECT on table public.products to anon;
grant TRUNCATE, INSERT, SELECT, UPDATE, DELETE, REFERENCES, TRIGGER, MAINTAIN on table public.products to authenticated;
grant INSERT, MAINTAIN, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT on table public.products to service_role;
grant REFERENCES, MAINTAIN, TRIGGER, TRUNCATE, DELETE, UPDATE, SELECT, INSERT on table public.profiles to anon;
grant SELECT, UPDATE, DELETE, MAINTAIN, TRIGGER, REFERENCES, TRUNCATE, INSERT on table public.profiles to authenticated;
grant TRUNCATE, REFERENCES, INSERT, TRIGGER, MAINTAIN, SELECT, UPDATE, DELETE on table public.profiles to service_role;
grant DELETE, REFERENCES, TRIGGER, MAINTAIN, INSERT, UPDATE, SELECT, TRUNCATE on table public.purchases to anon;
grant REFERENCES, MAINTAIN, TRIGGER, TRUNCATE, UPDATE, SELECT, INSERT, DELETE on table public.purchases to authenticated;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, INSERT, SELECT, UPDATE, DELETE on table public.purchases to service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, INSERT, SELECT, UPDATE, DELETE on table public.push_tokens to anon;
grant SELECT, MAINTAIN, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT on table public.push_tokens to authenticated;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, INSERT, SELECT, UPDATE, DELETE on table public.push_tokens to service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, INSERT, SELECT, UPDATE, DELETE on table public.quiz_scores to anon;
grant TRUNCATE, UPDATE, SELECT, INSERT, MAINTAIN, TRIGGER, REFERENCES, DELETE on table public.quiz_scores to authenticated;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, DELETE, SELECT, UPDATE, INSERT on table public.quiz_scores to service_role;
grant TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, MAINTAIN on table public.quiz_tests to anon;
grant INSERT, MAINTAIN, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT on table public.quiz_tests to authenticated;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, INSERT, SELECT, UPDATE, DELETE on table public.quiz_tests to service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, INSERT, SELECT, UPDATE, DELETE on table public.razorpay_webhook_events to anon;
grant TRUNCATE, UPDATE, SELECT, INSERT, MAINTAIN, TRIGGER, REFERENCES, DELETE on table public.razorpay_webhook_events to authenticated;
grant INSERT, SELECT, DELETE, UPDATE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table public.razorpay_webhook_events to service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, INSERT, SELECT, UPDATE, DELETE on table public.subjects to anon;
grant TRIGGER, MAINTAIN, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT on table public.subjects to authenticated;
grant DELETE, UPDATE, SELECT, INSERT, MAINTAIN, TRIGGER, REFERENCES, TRUNCATE on table public.subjects to service_role;
grant TRUNCATE, UPDATE, SELECT, INSERT, MAINTAIN, TRIGGER, REFERENCES, DELETE on table public.videos to anon;
grant TRUNCATE, UPDATE, SELECT, INSERT, MAINTAIN, TRIGGER, REFERENCES, DELETE on table public.videos to authenticated;
grant TRUNCATE, UPDATE, SELECT, INSERT, DELETE, REFERENCES, TRIGGER, MAINTAIN on table public.videos to service_role;
grant MAINTAIN, TRIGGER, REFERENCES, TRUNCATE, INSERT, DELETE, UPDATE, SELECT on table public.years to anon;
grant TRUNCATE, INSERT, SELECT, UPDATE, DELETE, REFERENCES, TRIGGER, MAINTAIN on table public.years to authenticated;
grant INSERT, MAINTAIN, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT on table public.years to service_role;
