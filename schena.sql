-- ============================================================================
-- MEDVEDA - RECONSTRUCTED FULL SCHEMA
-- ============================================================================
-- IMPORTANT - READ BEFORE RUNNING:
--
-- This file was rebuilt from the MOBILE APP'S SOURCE CODE (types/,
-- repositories/, services/) - not from your original schema.sql, which
-- was not part of what got uploaded to me. That means:
--   - Every table/column here is something the app code actually reads
--     or writes (confirmed against real .from("table").select/insert/
--     update calls), so it should be functionally accurate.
--   - Things the app never touches directly - exact constraint names,
--     indexes you added by hand, `payment_sessions` / `payments` (only
--     ever called from your Edge Functions, never from this app code) -
--     I could NOT recover from this source. The payment_sessions/payments
--     tables below are best-effort placeholders based on the
--     create-payment-session / pay / verify-payment names you described -
--     verify them against your actual Edge Function code before trusting
--     them, or better, paste those migration files if you still have them
--     and I'll fix this section to match exactly.
--
-- SAFE TO RUN ON PRODUCTION: every statement is idempotent -
-- `create table if not exists` (never drops/recreates a table that
-- already has data) and `drop policy if exists` + `create policy`
-- (policies are cheap to redefine, no data risk). Running this will
-- NOT touch or delete any existing row. It also will NOT fix a column
-- that already exists with a different name/type - if a table already
-- exists, `if not exists` skips it entirely and any column mismatches
-- need a separate `alter table`.
--
-- Run this whole file in ONE query (SQL Editor -> paste -> Run).
-- ============================================================================


-- ============================================================================
-- 1. PROFILES (mirrors auth.users, auto-created on signup)
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  email text,
  phone text,
  photo_url text,
  college text,
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);

-- Auto-creates a profile row the moment someone signs up via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- 2. ADMINS + am_i_admin() (used by every admin-only RLS policy below)
-- ============================================================================
create table if not exists public.admins (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create or replace function public.am_i_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admins where id = auth.uid());
$$;

-- >>> THIS IS LIKELY YOUR ACTUAL "notes RLS" FIX (screenshot 2) <<<
-- If the admin panel logs in with studyfact8545@gmail.com (or whichever
-- email you actually use to manage content) and that email has never
-- been inserted into `admins`, am_i_admin() returns false for every
-- write, and every admin-only insert/update/delete on notes/products/
-- videos/etc. gets blocked by RLS - exactly the error in your
-- screenshot. Run this once per admin email (safe to re-run, ON
-- CONFLICT just skips if already there):
insert into public.admins (id, email)
select id, email from auth.users where email = 'studyfact8545@gmail.com'
on conflict (id) do nothing;

-- Add any other admin emails the same way:
-- insert into public.admins (id, email)
-- select id, email from auth.users where email = 'ANOTHER_ADMIN_EMAIL'
-- on conflict (id) do nothing;


-- ============================================================================
-- 3. CONTENT HIERARCHY: years -> subjects -> chapters
-- ============================================================================
create table if not exists public.years (
  id text primary key,
  title text not null,
  icon text,
  color text,
  "order" integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id text primary key,
  title text not null,
  icon text,
  color text,
  year_id text not null references public.years (id) on delete cascade,
  "order" integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.chapters (
  id text primary key,
  title text not null,
  subject_id text not null references public.subjects (id) on delete cascade,
  year_id text references public.years (id) on delete set null,
  "order" integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);


-- ============================================================================
-- 4. CONTENT ITEMS: products (paid Notes packages), notes, videos, quiz_tests
-- ============================================================================
create table if not exists public.products (
  id text primary key,
  title text not null,
  description text,
  scope text not null check (scope in ('chapter', 'subject', 'year', 'bundle')),
  price numeric not null default 0,
  original_price numeric,
  active boolean not null default true,
  chapter_id text references public.chapters (id) on delete cascade,
  subject_id text references public.subjects (id) on delete cascade,
  year_id text references public.years (id) on delete cascade,
  year_ids text[],
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id text primary key,
  title text not null,
  pdf_url text not null,
  chapter_id text not null references public.chapters (id) on delete cascade,
  "order" integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.videos (
  id text primary key,
  title text not null,
  youtube_url text not null,
  subject_id text not null references public.subjects (id) on delete cascade,
  year_id text references public.years (id) on delete set null,
  "order" integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_tests (
  id text primary key,
  title text not null,
  subject_id text not null references public.subjects (id) on delete cascade,
  year_id text references public.years (id) on delete set null,
  "order" integer not null default 0,
  active boolean not null default true,
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);


-- ============================================================================
-- 5. COMMERCE: orders, purchases
-- ============================================================================
create table if not exists public.orders (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text references public.products (id) on delete set null,
  scope text not null check (scope in ('chapter', 'subject', 'year', 'bundle')),
  chapter_id text references public.chapters (id) on delete set null,
  subject_id text references public.subjects (id) on delete set null,
  year_id text references public.years (id) on delete set null,
  year_ids text[],
  amount numeric not null,
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'cancelled')),
  razorpay_order_id text,
  razorpay_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Written only by verify-payment (Edge Function, service-role key) -
-- this is the "do I own this?" record the app checks against.
create table if not exists public.purchases (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id text references public.orders (id) on delete set null,
  scope text not null check (scope in ('chapter', 'subject', 'year', 'bundle')),
  chapter_id text references public.chapters (id) on delete set null,
  subject_id text references public.subjects (id) on delete set null,
  year_id text references public.years (id) on delete set null,
  year_ids text[],
  title text,
  amount numeric,
  status text,
  created_at timestamptz not null default now()
);


-- ============================================================================
-- 6. BEST-EFFORT PLACEHOLDER: payment_sessions / payments
-- ============================================================================
-- NOT confirmed against your Edge Function code (this app source never
-- calls these tables directly - only create-payment-session/pay/
-- verify-payment do, server-side). Column names here are a reasonable
-- guess based on a standard Razorpay order-session flow. If you still
-- have the actual migration files for these, share them and I'll
-- replace this section with the exact original instead.
create table if not exists public.payment_sessions (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id text references public.orders (id) on delete cascade,
  razorpay_order_id text,
  status text not null default 'created',
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.payments (
  id text primary key,
  order_id text references public.orders (id) on delete cascade,
  razorpay_payment_id text,
  razorpay_signature text,
  amount numeric,
  status text not null default 'created',
  created_at timestamptz not null default now()
);


-- ============================================================================
-- 7. MISC: notifications, push_tokens, quiz_scores
-- ============================================================================
create table if not exists public.notifications (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  body text not null,
  type text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.push_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null unique,
  platform text,
  updated_at timestamptz not null default now(),
  primary key (expo_push_token)
);

-- id must stay `text` (not uuid) - the offline sync engine upserts with
-- a client-generated id for idempotent retries (see quizAttempts.ts).
create table if not exists public.quiz_scores (
  id text primary key,
  user_id uuid references auth.users (id) on delete cascade,
  email text,
  subject_id text references public.subjects (id) on delete set null,
  subject_title text,
  test_id text,
  test_title text,
  score integer,
  total integer,
  percentage integer,
  created_at timestamptz not null default now()
);


-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================
-- Pattern used throughout: anyone (incl. anonymous) can READ active
-- content; only an admin (am_i_admin()) can INSERT/UPDATE/DELETE. Rows
-- that belong to a specific user (profiles, orders, purchases,
-- push_tokens) are readable/writable only by that user, plus full
-- access for admins.

alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.years enable row level security;
alter table public.subjects enable row level security;
alter table public.chapters enable row level security;
alter table public.products enable row level security;
alter table public.notes enable row level security;
alter table public.videos enable row level security;
alter table public.quiz_tests enable row level security;
alter table public.orders enable row level security;
alter table public.purchases enable row level security;
alter table public.payment_sessions enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
alter table public.quiz_scores enable row level security;

-- profiles: a user can read/update their own row; admins can do anything.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.am_i_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.am_i_admin());

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (public.am_i_admin()) with check (public.am_i_admin());

-- admins: only admins can see/manage the admin list.
drop policy if exists "admins_admin_only" on public.admins;
create policy "admins_admin_only" on public.admins
  for all using (public.am_i_admin()) with check (public.am_i_admin());

-- Content tables: public read of active rows, admin-only write.
do $$
declare
  t text;
begin
  foreach t in array array['years', 'subjects', 'chapters', 'products', 'notes', 'videos', 'quiz_tests']
  loop
    execute format('drop policy if exists "%1$s_public_read_active" on public.%1$s', t);
    execute format(
      'create policy "%1$s_public_read_active" on public.%1$s for select using (active = true or public.am_i_admin())',
      t
    );

    execute format('drop policy if exists "%1$s_admin_write" on public.%1$s', t);
    execute format(
      'create policy "%1$s_admin_write" on public.%1$s for all using (public.am_i_admin()) with check (public.am_i_admin())',
      t
    );
  end loop;
end $$;

-- orders: a user can see/create their own; only admins/service-role update.
drop policy if exists "orders_select_own_or_admin" on public.orders;
create policy "orders_select_own_or_admin" on public.orders
  for select using (user_id = auth.uid() or public.am_i_admin());

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert with check (user_id = auth.uid());

drop policy if exists "orders_admin_write" on public.orders;
create policy "orders_admin_write" on public.orders
  for all using (public.am_i_admin()) with check (public.am_i_admin());

-- purchases: a user can only ever read their own; writes are server-side
-- only (verify-payment uses the service-role key, which bypasses RLS
-- entirely) - so there is deliberately no student-facing insert policy.
drop policy if exists "purchases_select_own_or_admin" on public.purchases;
create policy "purchases_select_own_or_admin" on public.purchases
  for select using (user_id = auth.uid() or public.am_i_admin());

drop policy if exists "purchases_admin_write" on public.purchases;
create policy "purchases_admin_write" on public.purchases
  for all using (public.am_i_admin()) with check (public.am_i_admin());

-- payment_sessions / payments: service-role (Edge Functions) bypasses
-- RLS automatically, so these just need to keep normal client access
-- locked down to "own rows, read-only".
drop policy if exists "payment_sessions_select_own" on public.payment_sessions;
create policy "payment_sessions_select_own" on public.payment_sessions
  for select using (user_id = auth.uid() or public.am_i_admin());

drop policy if exists "payments_admin_read" on public.payments;
create policy "payments_admin_read" on public.payments
  for select using (public.am_i_admin());

-- notifications: everyone can read active ones; only admins write.
drop policy if exists "notifications_public_read_active" on public.notifications;
create policy "notifications_public_read_active" on public.notifications
  for select using (active = true or public.am_i_admin());

drop policy if exists "notifications_admin_write" on public.notifications;
create policy "notifications_admin_write" on public.notifications
  for all using (public.am_i_admin()) with check (public.am_i_admin());

-- push_tokens: a user manages only their own device token.
drop policy if exists "push_tokens_own" on public.push_tokens;
create policy "push_tokens_own" on public.push_tokens
  for all using (user_id = auth.uid() or public.am_i_admin())
  with check (user_id = auth.uid() or public.am_i_admin());

-- quiz_scores: a user can read/write only their own attempts; admins see all.
drop policy if exists "quiz_scores_own_or_admin" on public.quiz_scores;
create policy "quiz_scores_own_or_admin" on public.quiz_scores
  for all using (user_id = auth.uid() or public.am_i_admin())
  with check (user_id = auth.uid() or public.am_i_admin());


-- ============================================================================
-- 9. STORAGE: "notes" bucket + purchase-gated read policy
-- ============================================================================
-- Referenced directly in services/secureNotesService.ts as
-- "notes_read_if_purchased" - recreated here to match. This is what
-- actually enforces the PDF paywall (not the app hiding a button).
--
-- NOTE: flip the bucket's Public toggle OFF in
-- Dashboard -> Storage -> notes -> Configuration once you've confirmed
-- getSecureNoteUrl() is being used everywhere a note PDF is opened -
-- this policy alone doesn't stop public getPublicUrl() access while the
-- bucket itself is still marked Public.
insert into storage.buckets (id, name, public)
values ('notes', 'notes', false)
on conflict (id) do nothing;

drop policy if exists "notes_read_if_purchased" on storage.objects;
create policy "notes_read_if_purchased" on storage.objects
  for select using (
    bucket_id = 'notes'
    and (
      public.am_i_admin()
      or exists (
        select 1
        from public.notes n
        join public.chapters c on c.id = n.chapter_id
        join public.purchases p on p.user_id = auth.uid()
        -- n.pdf_url stores the full getPublicUrl()-style URL, while
        -- storage.objects.name is just the bare path within the bucket
        -- (see services/secureNotesService.ts's extractStoragePath) -
        -- so match by "is this object's path part of the stored URL"
        -- rather than exact equality.
        where position(storage.objects.name in n.pdf_url) > 0
          and (
            p.scope = 'chapter' and p.chapter_id = c.id
            or p.scope = 'subject' and p.subject_id = c.subject_id
            or p.scope = 'year' and p.year_id = c.year_id
            or p.scope = 'bundle' and c.year_id = any (p.year_ids)
          )
      )
    )
  );

drop policy if exists "notes_admin_write" on storage.objects;
create policy "notes_admin_write" on storage.objects
  for all using (bucket_id = 'notes' and public.am_i_admin())
  with check (bucket_id = 'notes' and public.am_i_admin());

-- ============================================================================
-- DONE. Re-run any time - every statement above is safe to repeat.
-- ============================================================================
