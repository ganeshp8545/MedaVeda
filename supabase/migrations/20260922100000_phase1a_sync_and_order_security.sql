-- ============================================================================
-- MEDVEDA — PHASE 1A: PRODUCTION SYNC + ORDER / PAYMENT / PROFILE SECURITY
-- ============================================================================
-- Phase 1A of a two-step rollout (see docs/phase1/APPLY_AND_VERIFY.md).
--
--   PART A  brings production in line with the repo by folding in, in order,
--           the seven migrations that were never applied live:
--             20260919120000_multi_course_and_referrals.sql
--             20260919130000_referral_history_rpc.sql
--             20260920120000_null_year_course_fallback.sql
--             20260920130000_app_config.sql
--             20260920140000_default_new_profile_course.sql
--             20260921120000_analytics_retention.sql
--             20260921130000_account_deletion_support.sql
--           Their text is reproduced unchanged EXCEPT two edits marked
--           "MODIFIED FOR PHASE 1A", both made to keep already-released app
--           builds working:
--             (1) 0919 section 10b no longer drops the legacy policy
--                 "public read notes/thumbnails" (deferred to Phase 1B).
--             (2) 0921130000 no longer DROPS delete_my_account(); it becomes a
--                 backward-compatible wrapper around erase_user_data() (same
--                 RPC contract, accounting rows retained, signed-in users only).
--   PART B  security hardening that the repo did not contain:
--             B1 grant_razorpay_payment(): EXECUTE only for service_role; the
--                function also refuses orders with no server-side checkout
--                session for the order's product.
--             B2 orders: immutable to students (price, product, scope, ids,
--                payment ids, status); only created -> cancelled/failed, never
--                once a payment exists; inserts are re-priced from products
--                and can only be status 'created'.
--             B3 profiles: students can update only their own row; the trigger
--                from PART A blocks blocked / referral_code / course /
--                verification flags.
--             B4 (Phase 1B, NOT in this file) notes bucket private, public-read
--                policy dropped, free-preview rule.
--             B5 self-checks: abort (roll back everything) if any guarantee
--                above is not true, if storage buckets/policies changed, or if
--                any order / purchase / payment / profile / auth user / product
--                row count changed.
--
-- NOT touched here: storage buckets, storage policies for the notes bucket
-- (beyond the course-aware notes_read_if_purchased from 0919 section 10, which
-- still admits every buyer), Edge Functions, the mobile app.
-- Single transaction: any failure leaves production untouched. Idempotent.
-- Nothing is deleted from orders, purchases, payments, profiles, auth.users or
-- storage. Existing purchases keep working.
-- ============================================================================
begin;

create temp table _phase1_counts on commit drop as
select 'profiles' t, count(*) n from public.profiles
union all select 'orders', count(*) from public.orders
union all select 'purchases', count(*) from public.purchases
union all select 'payments', count(*) from public.payments
union all select 'auth_users', count(*) from auth.users
union all select 'products', count(*) from public.products;

create temp table _phase1_buckets on commit drop as
select id, public from storage.buckets;

create temp table _phase1_policies on commit drop as
select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects';

-- ############################################################################
-- PART A — MIGRATIONS NEVER APPLIED TO PRODUCTION (text unchanged except two marked edits)
-- ############################################################################

-- ===== BEGIN folded: 20260919120000_multi_course_and_referrals.sql =====
-- ============================================================================
-- MULTI-COURSE UPGRADE + REFERRAL SYSTEM
-- ============================================================================
-- Adds a `courses` table above `years`, denormalizes course_id (and, where
-- missing, year_id) down the content hierarchy, tightens RLS so students
-- only see their own course+year (plus anything purchased), fixes
-- grant_razorpay_payment() to derive purchase fields from the product
-- (never the client-writable order) and adds a self-serve referral system.
--
-- Idempotent and safe to re-run: every DDL/DML statement uses
-- if-not-exists / or-replace / drop-if-exists guards. Wrapped in a single
-- transaction so a failure partway through leaves no half-applied state.
--
-- Schema assumptions made here (see docs/multi-course-analysis.md §1 for
-- detail) — VERIFY AGAINST THE LIVE DB:
--   - years/subjects/chapters/notes/videos/quiz_tests/products/orders ids
--     are all `text`; only profiles/auth.users ids are `uuid`.
--   - years.course_id, subjects.year_id, chapters.subject_id are NOT NULL
--     already; chapters.year_id, videos.year_id, quiz_tests.year_id are
--     nullable ("on delete set null") in the reconstructed schema.
--   - purchases has a product_id column (added by
--     20260801150000_razorpay_webhook_atomic_grant.sql) usable for backfill.
--   - RLS policy names on orders/purchases: the real migrations and the
--     reconstructed schena.sql use DIFFERENT names for the same rules, so both
--     sets may be live (redundant, not conflicting - permissive policies are
--     ORed). This migration does not touch them; list what is live with
--     `select tablename, policyname, cmd from pg_policies
--       where schemaname = 'public' order by 1, 3, 2;` before applying.
--
-- ROLLBACK NOTES (not executed — for manual use if this needs reverting):
--   - Dropping the new `course_id`/`year_id` columns added here is the
--     main reversal: `alter table <t> drop column if exists course_id;`
--     (and `year_id` only on `notes`, which didn't have it before).
--   - Drop new tables: `drop table if exists public.referrals,
--     public.referral_settings, public.courses cascade;` — cascade will
--     also drop the FKs on years/subjects/etc referencing courses, but
--     will NOT drop the course_id/year_id columns themselves (drop those
--     explicitly first per above).
--   - Restore `grant_razorpay_payment()` and the `<table>_public_read_active`
--     policies from the previous migrations if this needs a full revert.
--   - This migration does not drop or rename anything pre-existing, so a
--     rollback never needs to "recreate" anything that was removed.
-- ============================================================================


-- ============================================================================
-- 0. PRE-FLIGHT ROW COUNTS
-- ============================================================================
do $$
declare
  v_years bigint; v_subjects bigint; v_chapters bigint; v_notes bigint;
  v_videos bigint; v_quiz bigint; v_products bigint; v_orders bigint;
  v_purchases bigint; v_profiles bigint;
begin
  select count(*) into v_years from public.years;
  select count(*) into v_subjects from public.subjects;
  select count(*) into v_chapters from public.chapters;
  select count(*) into v_notes from public.notes;
  select count(*) into v_videos from public.videos;
  select count(*) into v_quiz from public.quiz_tests;
  select count(*) into v_products from public.products;
  select count(*) into v_orders from public.orders;
  select count(*) into v_purchases from public.purchases;
  select count(*) into v_profiles from public.profiles;
  raise notice 'PRE-FLIGHT row counts — years:%, subjects:%, chapters:%, notes:%, videos:%, quiz_tests:%, products:%, orders:%, purchases:%, profiles:%',
    v_years, v_subjects, v_chapters, v_notes, v_videos, v_quiz, v_products, v_orders, v_purchases, v_profiles;
end;
$$;

-- ============================================================================
-- 1. COURSES TABLE + SEED
-- ============================================================================
create table if not exists public.courses (
  id text primary key default (gen_random_uuid()::text),
  name text not null,
  code text not null,
  description text,
  icon text,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists courses_code_unique_ci on public.courses (lower(code));

-- Self-sufficiency: the live DB was found NOT to have profiles.updated_at or
-- touch_profile_updated_at() (20260801_auth_verified_identities.sql was never
-- applied there). Both are defined here, identically and idempotently, so this
-- migration works whether or not that one has run.
-- profiles_before_write() (§8) also reads email_verified / mobile_verified, which
-- exist live only if that migration ran; it did not, so they are added here too
-- (same definitions). Without them every profile UPDATE would raise.
alter table public.profiles
  add column if not exists email_verified boolean not null default false,
  add column if not exists mobile_verified boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Generic updated_at-touch function (body is table-agnostic).
drop trigger if exists courses_touch_updated_at on public.courses;
create trigger courses_touch_updated_at
  before update on public.courses
  for each row execute function public.touch_profile_updated_at();

insert into public.courses (id, name, code, display_order, active) values
  ('bams', 'BAMS', 'BAMS', 1, true),
  ('bnys', 'BNYS', 'BNYS', 2, true),
  ('bsms', 'BSMS', 'BSMS', 3, true),
  ('bums', 'BUMS', 'BUMS', 4, true),
  ('bhms', 'BHMS', 'BHMS', 5, true)
on conflict (id) do nothing;

-- ============================================================================
-- 2. ADD course_id / year_id COLUMNS (nullable for now — backfilled in §3)
-- ============================================================================
alter table public.years
  add column if not exists course_id text references public.courses(id) on delete restrict;

alter table public.subjects
  add column if not exists course_id text references public.courses(id) on delete restrict;

alter table public.chapters
  add column if not exists course_id text references public.courses(id) on delete restrict;

-- notes previously had neither course_id nor year_id.
alter table public.notes
  add column if not exists course_id text references public.courses(id) on delete restrict,
  add column if not exists year_id text references public.years(id) on delete set null;

alter table public.videos
  add column if not exists course_id text references public.courses(id) on delete restrict;

alter table public.quiz_tests
  add column if not exists course_id text references public.courses(id) on delete restrict;

alter table public.products
  add column if not exists course_id text references public.courses(id) on delete restrict;

alter table public.orders
  add column if not exists course_id text references public.courses(id);

alter table public.purchases
  add column if not exists course_id text references public.courses(id);

alter table public.profiles
  add column if not exists course_id text references public.courses(id) on delete set null,
  add column if not exists year_id text references public.years(id) on delete set null,
  add column if not exists referral_code text;

create unique index if not exists profiles_referral_code_unique on public.profiles (referral_code);

-- Optional, per task spec §6 — quiz_scores gets course_id so analytics
-- don't mix courses. Not access-controlled (quiz_scores has no student-
-- facing RLS read restriction today beyond own-row), so no NOT NULL / no
-- consistency trigger — just a plain denormalized, backfilled column.
alter table public.quiz_scores
  add column if not exists course_id text references public.courses(id);

-- ============================================================================
-- 3. BACKFILL (order matters: parents before children)
-- ============================================================================
update public.years set course_id = 'bams' where course_id is null;

update public.subjects s set course_id = y.course_id
  from public.years y where y.id = s.year_id and s.course_id is null;
update public.subjects set course_id = 'bams' where course_id is null;

update public.chapters c set course_id = s.course_id, year_id = coalesce(c.year_id, s.year_id)
  from public.subjects s where s.id = c.subject_id and c.course_id is null;
update public.chapters set course_id = 'bams' where course_id is null;

update public.notes n set course_id = c.course_id, year_id = c.year_id
  from public.chapters c where c.id = n.chapter_id and n.course_id is null;
update public.notes set course_id = 'bams' where course_id is null;

update public.videos v set course_id = s.course_id, year_id = coalesce(v.year_id, s.year_id)
  from public.subjects s where s.id = v.subject_id and v.course_id is null;
update public.videos set course_id = 'bams' where course_id is null;

update public.quiz_tests q set course_id = s.course_id, year_id = coalesce(q.year_id, s.year_id)
  from public.subjects s where s.id = q.subject_id and q.course_id is null;
update public.quiz_tests set course_id = 'bams' where course_id is null;

update public.quiz_scores qs set course_id = s.course_id
  from public.subjects s where s.id = qs.subject_id and qs.course_id is null;
update public.quiz_scores set course_id = 'bams' where course_id is null;

-- products: derive per scope, from the specific parent the scope points at.
update public.products p set course_id = c.course_id
  from public.chapters c where p.scope = 'chapter' and c.id = p.chapter_id and p.course_id is null;
update public.products p set course_id = s.course_id
  from public.subjects s where p.scope = 'subject' and s.id = p.subject_id and p.course_id is null;
update public.products p set course_id = y.course_id
  from public.years y where p.scope = 'year' and y.id = p.year_id and p.course_id is null;
update public.products p set course_id = y.course_id
  from public.years y
  where p.scope = 'bundle' and p.year_ids is not null and array_length(p.year_ids, 1) > 0
    and y.id = p.year_ids[1] and p.course_id is null;
update public.products set course_id = 'bams' where course_id is null;

-- orders/purchases: prefer the linked product's course; fall back to
-- whichever of their own scope fields is populated; default to BAMS.
update public.orders o set course_id = p.course_id
  from public.products p where p.id = o.product_id and o.course_id is null;
update public.orders o set course_id = c.course_id
  from public.chapters c where o.course_id is null and o.chapter_id = c.id;
update public.orders o set course_id = s.course_id
  from public.subjects s where o.course_id is null and o.subject_id = s.id;
update public.orders o set course_id = y.course_id
  from public.years y where o.course_id is null and o.year_id = y.id;
update public.orders set course_id = 'bams' where course_id is null;

update public.purchases pu set course_id = p.course_id
  from public.products p where p.id = pu.product_id and pu.course_id is null;
update public.purchases pu set course_id = c.course_id
  from public.chapters c where pu.course_id is null and pu.chapter_id = c.id;
update public.purchases pu set course_id = s.course_id
  from public.subjects s where pu.course_id is null and pu.subject_id = s.id;
update public.purchases pu set course_id = y.course_id
  from public.years y where pu.course_id is null and pu.year_id = y.id;
update public.purchases set course_id = 'bams' where course_id is null;

-- Existing students were all BAMS. year_id is deliberately left null —
-- the app will ask them to pick a year once via the onboarding gate.
update public.profiles set course_id = 'bams' where course_id is null;

-- ============================================================================
-- 4. SANITY CHECK + NOT NULL
-- ============================================================================
do $$
declare
  v_bad_count bigint;
begin
  select count(*) into v_bad_count from public.years where course_id is null;
  if v_bad_count > 0 then raise exception 'years.course_id backfill incomplete: % rows', v_bad_count; end if;

  select count(*) into v_bad_count from public.subjects where course_id is null;
  if v_bad_count > 0 then raise exception 'subjects.course_id backfill incomplete: % rows', v_bad_count; end if;

  select count(*) into v_bad_count from public.chapters where course_id is null;
  if v_bad_count > 0 then raise exception 'chapters.course_id backfill incomplete: % rows', v_bad_count; end if;

  select count(*) into v_bad_count from public.notes where course_id is null;
  if v_bad_count > 0 then raise exception 'notes.course_id backfill incomplete: % rows', v_bad_count; end if;

  select count(*) into v_bad_count from public.videos where course_id is null;
  if v_bad_count > 0 then raise exception 'videos.course_id backfill incomplete: % rows', v_bad_count; end if;

  select count(*) into v_bad_count from public.quiz_tests where course_id is null;
  if v_bad_count > 0 then raise exception 'quiz_tests.course_id backfill incomplete: % rows', v_bad_count; end if;

  select count(*) into v_bad_count from public.products where course_id is null;
  if v_bad_count > 0 then raise exception 'products.course_id backfill incomplete: % rows', v_bad_count; end if;

  select count(*) into v_bad_count from public.orders where course_id is null;
  if v_bad_count > 0 then raise exception 'orders.course_id backfill incomplete: % rows', v_bad_count; end if;

  select count(*) into v_bad_count from public.purchases where course_id is null;
  if v_bad_count > 0 then raise exception 'purchases.course_id backfill incomplete: % rows', v_bad_count; end if;

  select count(*) into v_bad_count from public.profiles where course_id is null;
  if v_bad_count > 0 then raise exception 'profiles.course_id backfill incomplete: % rows', v_bad_count; end if;

  raise notice 'multi-course backfill sanity check passed: all course_id columns fully populated';
end;
$$;

alter table public.years alter column course_id set not null;
alter table public.subjects alter column course_id set not null;
alter table public.chapters alter column course_id set not null;
alter table public.notes alter column course_id set not null;
alter table public.videos alter column course_id set not null;
alter table public.quiz_tests alter column course_id set not null;
alter table public.products alter column course_id set not null;
alter table public.orders alter column course_id set not null;
alter table public.purchases alter column course_id set not null;
-- profiles.course_id/year_id deliberately stay NULLABLE, unlike every
-- other table above: handle_new_user() (the auth.users -> profiles
-- trigger, which this migration does not touch per the ground rules)
-- inserts a bare profiles row with no course_id at all. A NOT NULL
-- constraint here would make every new signup fail outright. Existing
-- users were backfilled to 'bams' above; new signups start with both
-- columns null and are routed through the post-login SelectCourseYear
-- onboarding gate (mobile Phase 6) until they pick both.

-- ============================================================================
-- 5. INDEXES
-- ============================================================================
create index if not exists idx_years_course_id on public.years(course_id);
create index if not exists idx_years_course_active on public.years(course_id, active);

create index if not exists idx_subjects_course_id on public.subjects(course_id);
create index if not exists idx_subjects_course_active on public.subjects(course_id, active);
create index if not exists idx_subjects_year_active on public.subjects(year_id, active);

create index if not exists idx_chapters_course_id on public.chapters(course_id);
create index if not exists idx_chapters_course_active on public.chapters(course_id, active);
create index if not exists idx_chapters_year_active on public.chapters(year_id, active);

create index if not exists idx_notes_course_id on public.notes(course_id);
create index if not exists idx_notes_year_id on public.notes(year_id);
create index if not exists idx_notes_course_active on public.notes(course_id, active);

create index if not exists idx_videos_course_id on public.videos(course_id);
create index if not exists idx_videos_course_active on public.videos(course_id, active);
create index if not exists idx_videos_year_active on public.videos(year_id, active);

create index if not exists idx_quiz_tests_course_id on public.quiz_tests(course_id);
create index if not exists idx_quiz_tests_course_active on public.quiz_tests(course_id, active);
create index if not exists idx_quiz_tests_year_active on public.quiz_tests(year_id, active);

create index if not exists idx_products_course_id on public.products(course_id);
create index if not exists idx_products_course_active on public.products(course_id, active);

create index if not exists idx_orders_course_id on public.orders(course_id);
create index if not exists idx_purchases_course_id on public.purchases(course_id);

create index if not exists idx_profiles_course_id on public.profiles(course_id);
create index if not exists idx_profiles_year_id on public.profiles(year_id);

create index if not exists idx_quiz_scores_course_id on public.quiz_scores(course_id);

-- ============================================================================
-- 6. CONSISTENCY TRIGGERS
-- ============================================================================
-- Pattern throughout: on insert/update, derive course_id (and year_id,
-- where denormalized) from the immediate parent if the client left it
-- null; raise an exception if the client supplied a value that disagrees.
-- AFTER-triggers on years/subjects/chapters propagate a course/year move
-- down to their children so denormalized columns never go stale.

-- --- subjects (parent: years) -------------------------------------------
create or replace function public.subjects_derive_course()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id text;
begin
  select course_id into v_course_id from public.years where id = new.year_id;
  if v_course_id is null then
    raise exception 'Unknown year_id % on subjects', new.year_id;
  end if;
  if new.course_id is null then
    new.course_id := v_course_id;
  elsif new.course_id is distinct from v_course_id then
    raise exception 'subjects.course_id (%) does not match its year''s course (%)', new.course_id, v_course_id;
  end if;
  return new;
end;
$$;

drop trigger if exists subjects_before_write on public.subjects;
create trigger subjects_before_write
  before insert or update on public.subjects
  for each row execute function public.subjects_derive_course();

create or replace function public.subjects_propagate_course_move()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.year_id is distinct from old.year_id or new.course_id is distinct from old.course_id then
    update public.chapters set year_id = new.year_id, course_id = new.course_id
      where subject_id = new.id and (year_id is distinct from new.year_id or course_id is distinct from new.course_id);
    update public.videos set year_id = new.year_id, course_id = new.course_id
      where subject_id = new.id and (year_id is distinct from new.year_id or course_id is distinct from new.course_id);
    update public.quiz_tests set year_id = new.year_id, course_id = new.course_id
      where subject_id = new.id and (year_id is distinct from new.year_id or course_id is distinct from new.course_id);
    update public.products set course_id = new.course_id
      where scope = 'subject' and subject_id = new.id and course_id is distinct from new.course_id;
    -- notes hang off chapters, not subjects; the chapters cascade below reaches them.
  end if;
  return new;
end;
$$;

drop trigger if exists subjects_after_write on public.subjects;
create trigger subjects_after_write
  after update on public.subjects
  for each row execute function public.subjects_propagate_course_move();

-- --- chapters (parent: subjects) -----------------------------------------
create or replace function public.chapters_derive_course()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id text;
  v_year_id text;
begin
  select course_id, year_id into v_course_id, v_year_id from public.subjects where id = new.subject_id;
  if v_course_id is null then
    raise exception 'Unknown subject_id % on chapters', new.subject_id;
  end if;
  if new.course_id is null then
    new.course_id := v_course_id;
  elsif new.course_id is distinct from v_course_id then
    raise exception 'chapters.course_id (%) does not match its subject''s course (%)', new.course_id, v_course_id;
  end if;
  if new.year_id is null then
    new.year_id := v_year_id;
  elsif new.year_id is distinct from v_year_id then
    raise exception 'chapters.year_id (%) does not match its subject''s year (%)', new.year_id, v_year_id;
  end if;
  return new;
end;
$$;

drop trigger if exists chapters_before_write on public.chapters;
create trigger chapters_before_write
  before insert or update on public.chapters
  for each row execute function public.chapters_derive_course();

create or replace function public.chapters_propagate_course_move()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.year_id is distinct from old.year_id or new.course_id is distinct from old.course_id then
    update public.notes set year_id = new.year_id, course_id = new.course_id
      where chapter_id = new.id and (year_id is distinct from new.year_id or course_id is distinct from new.course_id);
    update public.products set course_id = new.course_id
      where scope = 'chapter' and chapter_id = new.id and course_id is distinct from new.course_id;
  end if;
  return new;
end;
$$;

drop trigger if exists chapters_after_write on public.chapters;
create trigger chapters_after_write
  after update on public.chapters
  for each row execute function public.chapters_propagate_course_move();

-- --- notes (parent: chapters) ---------------------------------------------
create or replace function public.notes_derive_course()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id text;
  v_year_id text;
begin
  select course_id, year_id into v_course_id, v_year_id from public.chapters where id = new.chapter_id;
  if v_course_id is null then
    raise exception 'Unknown chapter_id % on notes', new.chapter_id;
  end if;
  if new.course_id is null then
    new.course_id := v_course_id;
  elsif new.course_id is distinct from v_course_id then
    raise exception 'notes.course_id (%) does not match its chapter''s course (%)', new.course_id, v_course_id;
  end if;
  if new.year_id is null then
    new.year_id := v_year_id;
  elsif new.year_id is distinct from v_year_id then
    raise exception 'notes.year_id (%) does not match its chapter''s year (%)', new.year_id, v_year_id;
  end if;
  return new;
end;
$$;

drop trigger if exists notes_before_write on public.notes;
create trigger notes_before_write
  before insert or update on public.notes
  for each row execute function public.notes_derive_course();

-- --- videos (parent: subjects) ---------------------------------------------
create or replace function public.videos_derive_course()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id text;
  v_year_id text;
begin
  select course_id, year_id into v_course_id, v_year_id from public.subjects where id = new.subject_id;
  if v_course_id is null then
    raise exception 'Unknown subject_id % on videos', new.subject_id;
  end if;
  if new.course_id is null then
    new.course_id := v_course_id;
  elsif new.course_id is distinct from v_course_id then
    raise exception 'videos.course_id (%) does not match its subject''s course (%)', new.course_id, v_course_id;
  end if;
  if new.year_id is null then
    new.year_id := v_year_id;
  elsif new.year_id is distinct from v_year_id then
    raise exception 'videos.year_id (%) does not match its subject''s year (%)', new.year_id, v_year_id;
  end if;
  return new;
end;
$$;

drop trigger if exists videos_before_write on public.videos;
create trigger videos_before_write
  before insert or update on public.videos
  for each row execute function public.videos_derive_course();

-- --- quiz_tests (parent: subjects) ------------------------------------------
create or replace function public.quiz_tests_derive_course()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id text;
  v_year_id text;
begin
  select course_id, year_id into v_course_id, v_year_id from public.subjects where id = new.subject_id;
  if v_course_id is null then
    raise exception 'Unknown subject_id % on quiz_tests', new.subject_id;
  end if;
  if new.course_id is null then
    new.course_id := v_course_id;
  elsif new.course_id is distinct from v_course_id then
    raise exception 'quiz_tests.course_id (%) does not match its subject''s course (%)', new.course_id, v_course_id;
  end if;
  if new.year_id is null then
    new.year_id := v_year_id;
  elsif new.year_id is distinct from v_year_id then
    raise exception 'quiz_tests.year_id (%) does not match its subject''s year (%)', new.year_id, v_year_id;
  end if;
  return new;
end;
$$;

drop trigger if exists quiz_tests_before_write on public.quiz_tests;
create trigger quiz_tests_before_write
  before insert or update on public.quiz_tests
  for each row execute function public.quiz_tests_derive_course();

-- --- products (parent varies by scope) --------------------------------------
create or replace function public.products_derive_course()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id text;
  v_matched_years integer;
  v_distinct_courses integer;
begin
  if new.scope = 'chapter' then
    if new.chapter_id is null then
      raise exception 'products.chapter_id is required for scope=chapter';
    end if;
    select course_id into v_course_id from public.chapters where id = new.chapter_id;
    if v_course_id is null then
      raise exception 'Unknown chapter_id % on products', new.chapter_id;
    end if;

  elsif new.scope = 'subject' then
    if new.subject_id is null then
      raise exception 'products.subject_id is required for scope=subject';
    end if;
    select course_id into v_course_id from public.subjects where id = new.subject_id;
    if v_course_id is null then
      raise exception 'Unknown subject_id % on products', new.subject_id;
    end if;

  elsif new.scope = 'year' then
    if new.year_id is null then
      raise exception 'products.year_id is required for scope=year';
    end if;
    select course_id into v_course_id from public.years where id = new.year_id;
    if v_course_id is null then
      raise exception 'Unknown year_id % on products', new.year_id;
    end if;

  elsif new.scope = 'bundle' then
    if new.year_ids is null or array_length(new.year_ids, 1) is null then
      raise exception 'products.year_ids is required and non-empty for scope=bundle';
    end if;

    select count(*), count(distinct y.course_id)
      into v_matched_years, v_distinct_courses
      from public.years y
      where y.id = any(new.year_ids);

    if v_matched_years <> array_length(new.year_ids, 1) then
      raise exception 'products.year_ids contains an unknown year id';
    end if;
    if v_distinct_courses <> 1 then
      raise exception 'products.year_ids must all belong to the same course (found % distinct courses)', v_distinct_courses;
    end if;

    select y.course_id into v_course_id from public.years y where y.id = new.year_ids[1];

  else
    raise exception 'Unknown product scope: %', new.scope;
  end if;

  if new.course_id is null then
    new.course_id := v_course_id;
  elsif new.course_id is distinct from v_course_id then
    raise exception 'products.course_id (%) does not match its content''s course (%)', new.course_id, v_course_id;
  end if;

  return new;
end;
$$;

drop trigger if exists products_before_write on public.products;
create trigger products_before_write
  before insert or update on public.products
  for each row execute function public.products_derive_course();

-- --- years: guard against a course-move that would break a bundle -----------
create or replace function public.years_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.course_id is distinct from old.course_id then
    if exists (select 1 from public.products p where p.scope = 'bundle' and old.id = any(p.year_ids)) then
      raise exception 'Cannot move year % to another course while a bundle product references it; update or remove the bundle first', old.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists years_before_write on public.years;
create trigger years_before_write
  before update on public.years
  for each row execute function public.years_before_write();

create or replace function public.years_propagate_course_move()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.course_id is distinct from old.course_id then
    update public.subjects set course_id = new.course_id
      where year_id = new.id and course_id is distinct from new.course_id;
    update public.products set course_id = new.course_id
      where scope = 'year' and year_id = new.id and course_id is distinct from new.course_id;
    -- chapters/notes/videos/quiz_tests follow transitively via the
    -- subjects_after_write cascade triggered by the update above.
  end if;
  return new;
end;
$$;

drop trigger if exists years_after_write on public.years;
create trigger years_after_write
  after update on public.years
  for each row execute function public.years_propagate_course_move();

-- --- orders: safety net so course_id is always correct even if the -------
--     mobile app hasn't been updated yet to send it explicitly.
create or replace function public.orders_derive_course()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id text;
begin
  -- Only the payment system (service role: no auth.uid()) or an admin may
  -- mark an order paid. The real orders RLS already requires status =
  -- 'created' on insert and forbids 'paid' on update, but the reconstructed
  -- schena.sql has an insert policy without that check - if that one is live,
  -- a student could fabricate "paid" orders (no content, but it inflates the
  -- admin revenue analytics). This holds whichever policies are deployed.
  if auth.uid() is not null and new.status = 'paid'
     and (tg_op = 'INSERT' or old.status is distinct from 'paid')
     and not public.am_i_admin() then
    raise exception 'Orders can only be marked paid by the payment system';
  end if;

  select course_id into v_course_id from public.products where id = new.product_id;
  if v_course_id is null then
    raise exception 'Unknown product_id % on orders', new.product_id;
  end if;
  if new.course_id is null then
    new.course_id := v_course_id;
  elsif new.course_id is distinct from v_course_id then
    raise exception 'orders.course_id (%) does not match its product''s course (%)', new.course_id, v_course_id;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_before_write on public.orders;
create trigger orders_before_write
  before insert or update on public.orders
  for each row execute function public.orders_derive_course();

-- purchases has no equivalent trigger: it is only ever written by
-- grant_razorpay_payment() (service role, RLS has no insert policy for
-- authenticated at all — see orders_purchases_rls.sql) and that function
-- is updated in §9 below to set course_id directly from the product.

-- ============================================================================
-- 7. ACCESS HELPER FUNCTIONS
-- ============================================================================
create or replace function public.my_course_id()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select course_id from public.profiles where id = auth.uid();
$$;

create or replace function public.my_year_id()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select year_id from public.profiles where id = auth.uid();
$$;

-- True for an admin, for a student's own course+year, or for anyone
-- holding a successful purchase whose scope covers this course+year —
-- so a student who moves from 1st to 2nd year keeps what they paid for.
-- A null p_year_id (used for course-wide content, e.g. a cross-year
-- bundle product) matches on course alone.
create or replace function public.has_content_access(p_course_id text, p_year_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.am_i_admin()
    or exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.course_id = p_course_id
        and (p_year_id is null or pr.year_id = p_year_id)
    )
    or exists (
      select 1
      from public.purchases pu
      left join public.chapters ch on pu.scope = 'chapter' and ch.id = pu.chapter_id
      left join public.subjects sb on pu.scope = 'subject' and sb.id = pu.subject_id
      where pu.user_id = auth.uid()
        and pu.status = 'success'
        and pu.course_id = p_course_id
        and (
          p_year_id is null
          or (pu.scope = 'year' and pu.year_id = p_year_id)
          or (pu.scope = 'bundle' and p_year_id = any(pu.year_ids))
          or (pu.scope = 'chapter' and ch.year_id = p_year_id)
          or (pu.scope = 'subject' and sb.year_id = p_year_id)
        )
    );
$$;

-- Used by the notes storage policy (and available for app-side checks).
-- Compares purchases.course_id against the chapter's own course_id as
-- defense-in-depth (chapter ids are globally unique text PKs so a
-- cross-course id collision can't happen by construction, but this keeps
-- the intent explicit and survives future schema changes).
create or replace function public.user_owns_chapter(p_chapter_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.am_i_admin()
    or exists (
      select 1
      from public.chapters c
      join public.purchases p
        on p.user_id = auth.uid()
        and p.status = 'success'
        and p.course_id = c.course_id
      where c.id = p_chapter_id
        and (
          (p.scope = 'chapter' and p.chapter_id = c.id)
          or (p.scope = 'subject' and p.subject_id = c.subject_id)
          or (p.scope = 'year' and p.year_id = c.year_id)
          or (p.scope = 'bundle' and c.year_id = any(p.year_ids))
        )
    );
$$;

-- Validated RPC for a student to change their own course/year. Direct
-- column writes to profiles.course_id/year_id are blocked for non-admins
-- by the guard trigger in §8 — this is the only allowed path.
create or replace function public.set_my_course_year(p_course_id text, p_year_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_course_active boolean;
  v_year_course_id text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select active into v_course_active from public.courses where id = p_course_id;
  if v_course_active is null then
    raise exception 'Unknown course: %', p_course_id;
  end if;
  if not v_course_active then
    raise exception 'Course % is not active', p_course_id;
  end if;

  if p_year_id is not null then
    select course_id into v_year_course_id from public.years where id = p_year_id and active = true;
    if v_year_course_id is null then
      raise exception 'Unknown or inactive year: %', p_year_id;
    end if;
    if v_year_course_id is distinct from p_course_id then
      raise exception 'Year % does not belong to course %', p_year_id, p_course_id;
    end if;
  end if;

  -- Transaction-local bypass flag so profiles_before_write() (§8) allows
  -- this specific, already-validated write to course_id/year_id.
  perform set_config('app.allow_profile_admin_fields', 'true', true);

  update public.profiles
  set course_id = p_course_id, year_id = p_year_id, updated_at = now()
  where id = v_uid;
end;
$$;

revoke all on function public.set_my_course_year(text, text) from public;
grant execute on function public.set_my_course_year(text, text) to authenticated;

-- ============================================================================
-- 8. PROFILES: guard protected columns + self-heal year/course consistency
-- ============================================================================
create or replace function public.profiles_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_course_id text;
  v_bypass boolean := coalesce(current_setting('app.allow_profile_admin_fields', true), 'false') = 'true';
  v_is_admin boolean := public.am_i_admin();
begin
  -- A non-admin, non-RPC-mediated update may never touch these columns.
  if tg_op = 'UPDATE' and not v_bypass and not v_is_admin then
    if new.blocked is distinct from old.blocked
       or new.referral_code is distinct from old.referral_code
       or new.email_verified is distinct from old.email_verified
       or new.mobile_verified is distinct from old.mobile_verified
       or new.course_id is distinct from old.course_id
       or new.year_id is distinct from old.year_id
    then
      raise exception 'Cannot modify protected profile fields directly; use set_my_course_year() or contact support.';
    end if;
  end if;

  -- Self-heal: if year_id no longer belongs to course_id (course changed,
  -- admin edit, etc.), silently clear it rather than erroring.
  if new.year_id is not null then
    select course_id into v_year_course_id from public.years where id = new.year_id;
    if v_year_course_id is null or v_year_course_id is distinct from new.course_id then
      new.year_id := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_before_write on public.profiles;
create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function public.profiles_before_write();

-- ============================================================================
-- 9. RLS: courses, years, and content tables
-- ============================================================================
alter table public.courses enable row level security;

drop policy if exists "courses_public_read_active" on public.courses;
create policy "courses_public_read_active" on public.courses
  for select using (active = true or public.am_i_admin());

drop policy if exists "courses_admin_write" on public.courses;
create policy "courses_admin_write" on public.courses
  for all using (public.am_i_admin()) with check (public.am_i_admin());

-- years: kept anonymously readable (needed for onboarding), but now also
-- requires the year's course to be active.
alter table public.years enable row level security;

drop policy if exists "years_public_read_active" on public.years;
create policy "years_public_read_active" on public.years
  for select using (
    (active = true and exists (
      select 1 from public.courses c where c.id = years.course_id and c.active = true
    ))
    or public.am_i_admin()
  );

drop policy if exists "years_admin_write" on public.years;
create policy "years_admin_write" on public.years
  for all using (public.am_i_admin()) with check (public.am_i_admin());

-- subjects/chapters/notes/videos/quiz_tests: authenticated + course/year
-- access required. Anonymous read is removed (see docs/multi-course-
-- analysis.md §3 — no code path in this repo relies on it).
alter table public.subjects enable row level security;
drop policy if exists "subjects_public_read_active" on public.subjects;
create policy "subjects_public_read_active" on public.subjects
  for select to authenticated
  using (active = true and public.has_content_access(course_id, year_id));
drop policy if exists "subjects_admin_write" on public.subjects;
create policy "subjects_admin_write" on public.subjects
  for all using (public.am_i_admin()) with check (public.am_i_admin());

alter table public.chapters enable row level security;
drop policy if exists "chapters_public_read_active" on public.chapters;
create policy "chapters_public_read_active" on public.chapters
  for select to authenticated
  using (active = true and public.has_content_access(course_id, year_id));
drop policy if exists "chapters_admin_write" on public.chapters;
create policy "chapters_admin_write" on public.chapters
  for all using (public.am_i_admin()) with check (public.am_i_admin());

alter table public.notes enable row level security;
drop policy if exists "notes_public_read_active" on public.notes;
create policy "notes_public_read_active" on public.notes
  for select to authenticated
  using (active = true and public.has_content_access(course_id, year_id));
drop policy if exists "notes_admin_write" on public.notes;
create policy "notes_admin_write" on public.notes
  for all using (public.am_i_admin()) with check (public.am_i_admin());

alter table public.videos enable row level security;
drop policy if exists "videos_public_read_active" on public.videos;
create policy "videos_public_read_active" on public.videos
  for select to authenticated
  using (active = true and public.has_content_access(course_id, year_id));
drop policy if exists "videos_admin_write" on public.videos;
create policy "videos_admin_write" on public.videos
  for all using (public.am_i_admin()) with check (public.am_i_admin());

alter table public.quiz_tests enable row level security;
drop policy if exists "quiz_tests_public_read_active" on public.quiz_tests;
create policy "quiz_tests_public_read_active" on public.quiz_tests
  for select to authenticated
  using (active = true and public.has_content_access(course_id, year_id));
drop policy if exists "quiz_tests_admin_write" on public.quiz_tests;
create policy "quiz_tests_admin_write" on public.quiz_tests
  for all using (public.am_i_admin()) with check (public.am_i_admin());

-- products: scope determines which parent's year gates visibility.
-- Handled with a dedicated policy rather than forcing it through
-- has_content_access(course_id, year_id) directly, because products.year_id
-- keeps its pre-existing meaning (the scope='year' target) and is left
-- null for chapter/subject/bundle scope — repurposing it would risk
-- breaking existing app queries that filter products by year_id assuming
-- it's only ever set for scope='year'.
alter table public.products enable row level security;
drop policy if exists "products_public_read_active" on public.products;
create policy "products_public_read_active" on public.products
  for select to authenticated
  using (
    active = true
    and (
      public.am_i_admin()
      or (scope = 'bundle' and public.has_content_access(course_id, null))
      or (scope = 'year' and public.has_content_access(course_id, year_id))
      or (scope = 'subject' and exists (
            select 1 from public.subjects s
            where s.id = products.subject_id and public.has_content_access(products.course_id, s.year_id)
          ))
      or (scope = 'chapter' and exists (
            select 1 from public.chapters c
            where c.id = products.chapter_id and public.has_content_access(products.course_id, c.year_id)
          ))
    )
  );
drop policy if exists "products_admin_write" on public.products;
create policy "products_admin_write" on public.products
  for all using (public.am_i_admin()) with check (public.am_i_admin());

-- ============================================================================
-- 10. STORAGE: notes_read_if_purchased now course-aware via user_owns_chapter()
-- ============================================================================
drop policy if exists "notes_read_if_purchased" on storage.objects;
create policy "notes_read_if_purchased" on storage.objects
  for select using (
    bucket_id = 'notes'
    and (
      public.am_i_admin()
      or exists (
        select 1
        from public.notes n
        where position(storage.objects.name in n.pdf_url) > 0
          and public.user_owns_chapter(n.chapter_id)
      )
    )
  );

drop policy if exists "notes_admin_write" on storage.objects;
create policy "notes_admin_write" on storage.objects
  for all using (bucket_id = 'notes' and public.am_i_admin())
  with check (bucket_id = 'notes' and public.am_i_admin());

-- ----------------------------------------------------------------------------
-- 10b. LEGACY PERMISSIVE POLICIES (found on the live DB via pg_dump)
-- ----------------------------------------------------------------------------
-- Live carries a SECOND, older policy set (schena.sql-style names) next to the
-- <table>_public_read_active ones. Permissive policies are ORed, so these
-- legacy SELECT policies ("any signed-in user may read every active row")
-- silently defeat the course/year isolation and purchase gating above:
-- a BAMS student could still read BHMS rows. They are dropped here.
-- Admin-only legacy write policies ("admin write X", "Admin can manage notes")
-- are left alone: they only ever grant admins access, which is unchanged.
drop policy if exists "public read active years"    on public.years;
drop policy if exists "public read active subjects" on public.subjects;
drop policy if exists "public read active chapters" on public.chapters;
drop policy if exists "read notes"                  on public.notes;
drop policy if exists "Authenticated users can read notes" on public.notes;
drop policy if exists "public read active videos"   on public.videos;
drop policy if exists "public read active quiz_tests" on public.quiz_tests;
drop policy if exists "public read active products" on public.products;

-- Legacy storage SELECT on bucket 'notes' AND 'thumbnails' for everyone made
-- every note PDF downloadable by name regardless of purchase, bypassing
-- notes_read_if_purchased. Replace it with a thumbnails-only public read so
-- product/thumbnail images keep working; 'notes' is now gated by
-- notes_read_if_purchased (purchase / admin) only.
-- MODIFIED FOR PHASE 1A (deferred to Phase 1B): the original line below removed
-- the legacy public read policy on the notes/thumbnails buckets. It stays until
-- no released app build can need it. Original line:
--   drop policy if exists "public read notes/thumbnails" on storage.objects;
drop policy if exists "public read thumbnails" on storage.objects;
create policy "public read thumbnails" on storage.objects
  for select using (bucket_id = 'thumbnails');

-- ============================================================================
-- 11. grant_razorpay_payment(): course-aware, derives from PRODUCTS not orders
-- ============================================================================
-- Same signature/locking/amount-check/idempotency as before. The purchase
-- row's scope/chapter_id/subject_id/year_id/year_ids/course_id now come
-- straight from the product, not from the order — defense-in-depth on top
-- of the /pay Edge Function's existing snapshot-from-product step (see
-- docs/multi-course-analysis.md §2), and the only place course_id can enter
-- purchases at all.
create or replace function public.grant_razorpay_payment(
  p_event_id text,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_amount_paise bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_product_title text;
  v_existing_payment_order_id text;
begin
  if p_event_id is null or p_razorpay_order_id is null or p_razorpay_payment_id is null
    or p_amount_paise <= 0 then
    raise exception 'invalid Razorpay settlement parameters';
  end if;

  select * into v_order
  from public.orders
  where razorpay_order_id = p_razorpay_order_id
  for update;

  if not found then
    raise exception 'Razorpay order % is not linked to an internal order', p_razorpay_order_id;
  end if;
  if round(v_order.amount * 100)::bigint <> p_amount_paise then
    raise exception 'Razorpay amount does not match order amount';
  end if;

  select * into v_product from public.products where id = v_order.product_id;
  if not found then
    raise exception 'Order % references unknown product %', v_order.id, v_order.product_id;
  end if;
  v_product_title := coalesce(v_product.title, 'Your content');

  select order_id into v_existing_payment_order_id
  from public.payments
  where razorpay_payment_id = p_razorpay_payment_id;
  if found and v_existing_payment_order_id <> v_order.id then
    raise exception 'Razorpay payment is already linked to another order';
  end if;

  insert into public.payments (
    order_id, user_id, product_id, amount, razorpay_order_id,
    razorpay_payment_id, status, verified_at
  ) values (
    v_order.id, v_order.user_id, v_order.product_id, v_order.amount,
    p_razorpay_order_id, p_razorpay_payment_id, 'success', now()
  ) on conflict (razorpay_payment_id) do nothing;

  insert into public.purchases (
    user_id, order_id, product_id, product_title, scope, chapter_id,
    subject_id, year_id, year_ids, course_id, amount, status, razorpay_order_id
  ) values (
    v_order.user_id, v_order.id, v_product.id, v_product_title,
    v_product.scope, v_product.chapter_id, v_product.subject_id, v_product.year_id,
    v_product.year_ids, v_product.course_id, v_order.amount, 'success', p_razorpay_order_id
  ) on conflict (order_id) do nothing;

  update public.orders
  set status = 'paid', razorpay_payment_id = p_razorpay_payment_id,
      course_id = v_product.course_id, updated_at = now()
  where id = v_order.id;

  -- Referral qualification for qualify_on = 'first_purchase' (idempotent:
  -- only rows still 'pending' are touched).
  update public.referrals
  set status = 'qualified', qualified_at = now()
  where referred_id = v_order.user_id
    and status = 'pending'
    and exists (
      select 1 from public.referral_settings where id = true and qualify_on = 'first_purchase'
    );

  insert into public.razorpay_webhook_events(event_id, razorpay_payment_id, event_type)
  values (p_event_id, p_razorpay_payment_id, 'payment.captured')
  on conflict (event_id) do nothing;
end;
$$;

revoke all on function public.grant_razorpay_payment(text, text, text, bigint) from public;
grant execute on function public.grant_razorpay_payment(text, text, text, bigint) to service_role;

-- ============================================================================
-- 12. REFERRAL SYSTEM
-- ============================================================================
-- 12a. referral_settings (single row)
create table if not exists public.referral_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  reward_type text not null default 'none' check (reward_type in ('none','discount_percent','discount_flat','credit')),
  referrer_reward_value numeric,
  referee_reward_value numeric,
  qualify_on text not null default 'signup' check (qualify_on in ('signup','first_purchase')),
  max_referrals_per_user integer,
  updated_at timestamptz not null default now()
);

insert into public.referral_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists referral_settings_touch_updated_at on public.referral_settings;
create trigger referral_settings_touch_updated_at
  before update on public.referral_settings
  for each row execute function public.touch_profile_updated_at();

alter table public.referral_settings enable row level security;

drop policy if exists "referral_settings_read_authenticated" on public.referral_settings;
create policy "referral_settings_read_authenticated" on public.referral_settings
  for select to authenticated using (true);

drop policy if exists "referral_settings_admin_write" on public.referral_settings;
create policy "referral_settings_admin_write" on public.referral_settings
  for all using (public.am_i_admin()) with check (public.am_i_admin());

-- 12b. referrals
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null unique references public.profiles(id) on delete cascade,
  code_used text not null,
  status text not null default 'pending' check (status in ('pending','qualified','rewarded','rejected')),
  reject_reason text,
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  rewarded_at timestamptz,
  constraint referrals_no_self_referral check (referrer_id <> referred_id)
);

create index if not exists idx_referrals_referrer on public.referrals(referrer_id);
create index if not exists idx_referrals_status on public.referrals(status);

alter table public.referrals enable row level security;

-- Students see rows where they're either side; no direct insert/update —
-- every write goes through apply_referral_code() (security definer) or an
-- admin.
drop policy if exists "referrals_read_own" on public.referrals;
create policy "referrals_read_own" on public.referrals
  for select
  using (referrer_id = auth.uid() or referred_id = auth.uid() or public.am_i_admin());

drop policy if exists "referrals_admin_write" on public.referrals;
create policy "referrals_admin_write" on public.referrals
  for all using (public.am_i_admin()) with check (public.am_i_admin());

-- 12c. referral code generation (separate trigger on public.profiles —
-- deliberately NOT touching handle_new_user()/the auth.users trigger, per
-- ground rules, since that trigger's real column-mapping is unverified).
create or replace function public.generate_unique_referral_code(p_length int default 7)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Uppercase, unambiguous charset: excludes 0/O, 1/I/L.
  v_charset text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text;
  v_attempt int := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    v_code := '';
    for i in 1..p_length loop
      v_code := v_code || substr(v_charset, 1 + floor(random() * length(v_charset))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
    if v_attempt > 30 then
      raise exception 'Could not generate a unique referral code after % attempts', v_attempt;
    end if;
  end loop;
  return v_code;
end;
$$;

create or replace function public.profiles_generate_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referral_code is null then
    new.referral_code := public.generate_unique_referral_code();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_before_insert_referral_code on public.profiles;
create trigger profiles_before_insert_referral_code
  before insert on public.profiles
  for each row execute function public.profiles_generate_referral_code();

-- Backfill existing profiles one at a time (collision-safe).
-- profiles_before_write() (§8) rejects changes to referral_code from anyone
-- who isn't an admin or a validated RPC, and a migration is neither - so use
-- the same transaction-local bypass flag set_my_course_year() uses.
do $$
declare
  r record;
begin
  perform set_config('app.allow_profile_admin_fields', 'true', true);
  for r in select id from public.profiles where referral_code is null loop
    update public.profiles set referral_code = public.generate_unique_referral_code() where id = r.id;
  end loop;
  perform set_config('app.allow_profile_admin_fields', 'false', true);
end;
$$;

alter table public.profiles alter column referral_code set not null;

-- 12d. apply_referral_code RPC
create or replace function public.apply_referral_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_settings public.referral_settings%rowtype;
  v_referrer public.profiles%rowtype;
  v_caller public.profiles%rowtype;
  v_signup_window interval := interval '7 days';
  v_referral_count integer;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'error', 'message', 'Not authenticated.');
  end if;
  if p_code is null or length(trim(p_code)) = 0 then
    return jsonb_build_object('status', 'invalid_code', 'message', 'Please enter a referral code.');
  end if;

  select * into v_settings from public.referral_settings where id = true;
  if v_settings is null or not v_settings.enabled then
    return jsonb_build_object('status', 'disabled', 'message', 'Referrals are not available right now.');
  end if;

  select * into v_caller from public.profiles where id = v_uid;
  if v_caller is null then
    return jsonb_build_object('status', 'error', 'message', 'Profile not found.');
  end if;

  select * into v_referrer from public.profiles where upper(referral_code) = upper(trim(p_code));
  if v_referrer is null then
    return jsonb_build_object('status', 'invalid_code', 'message', 'That referral code was not found.');
  end if;

  if v_referrer.id = v_uid then
    return jsonb_build_object('status', 'self_referral', 'message', 'You cannot refer yourself.');
  end if;

  if v_referrer.blocked then
    return jsonb_build_object('status', 'referrer_blocked', 'message', 'That referral code is no longer active.');
  end if;

  if exists (select 1 from public.referrals where referred_id = v_uid) then
    return jsonb_build_object('status', 'already_referred', 'message', 'A referral code has already been applied to your account.');
  end if;

  if v_caller.created_at < now() - v_signup_window then
    return jsonb_build_object('status', 'too_late', 'message', 'Referral codes can only be applied shortly after signing up.');
  end if;

  if exists (select 1 from public.purchases where user_id = v_uid and status = 'success') then
    return jsonb_build_object('status', 'already_purchased', 'message', 'Referral codes must be applied before your first purchase.');
  end if;

  if v_settings.max_referrals_per_user is not null then
    select count(*) into v_referral_count from public.referrals where referrer_id = v_referrer.id;
    if v_referral_count >= v_settings.max_referrals_per_user then
      return jsonb_build_object('status', 'referrer_limit_reached', 'message', 'That referral code has reached its usage limit.');
    end if;
  end if;

  insert into public.referrals (referrer_id, referred_id, code_used, status, qualified_at)
  values (
    v_referrer.id, v_uid, upper(trim(p_code)),
    case when v_settings.qualify_on = 'signup' then 'qualified' else 'pending' end,
    case when v_settings.qualify_on = 'signup' then now() else null end
  );

  return jsonb_build_object('status', 'success', 'message', 'Referral applied successfully.');
exception
  when unique_violation then
    return jsonb_build_object('status', 'already_referred', 'message', 'A referral code has already been applied to your account.');
end;
$$;

revoke all on function public.apply_referral_code(text) from public;
grant execute on function public.apply_referral_code(text) to authenticated;

-- NOTE (documented TODO, not implemented here — see task ground rules):
-- reward_type/referrer_reward_value/referee_reward_value are recorded in
-- referral_settings but no automatic payout, wallet credit, or price
-- discount is applied anywhere. A 'rewarded' referrals.status must be set
-- manually (e.g. by an admin) until a reward-application mechanism is
-- deliberately designed and approved.

-- ============================================================================
-- 13. FINAL SANITY CHECK
-- ============================================================================
do $$
declare
  v_bad_count bigint;
begin
  select count(*) into v_bad_count
  from public.subjects s join public.years y on y.id = s.year_id
  where s.course_id is distinct from y.course_id;
  if v_bad_count > 0 then raise exception 'subjects/years course_id mismatch: % rows', v_bad_count; end if;

  select count(*) into v_bad_count
  from public.chapters c join public.subjects s on s.id = c.subject_id
  where c.course_id is distinct from s.course_id;
  if v_bad_count > 0 then raise exception 'chapters/subjects course_id mismatch: % rows', v_bad_count; end if;

  select count(*) into v_bad_count from public.profiles where referral_code is null;
  if v_bad_count > 0 then raise exception 'profiles missing referral_code: % rows', v_bad_count; end if;

  raise notice 'multi-course + referrals migration completed successfully';
end;
$$;


-- ===== END folded: 20260919120000_multi_course_and_referrals.sql =====

-- ===== BEGIN folded: 20260919130000_referral_history_rpc.sql =====
-- Referral history for the referrer ("Refer & Earn" screen).
--
-- A student can only read their OWN profiles row under RLS, so joining the
-- referred user's name client-side would always come back empty. This
-- security definer RPC returns just the referred user's FIRST NAME (never
-- email/phone) for referrals where the caller is the referrer.
-- Depends on 20260919120000_multi_course_and_referrals.sql.

create or replace function public.get_my_referrals()
returns table (
  id uuid,
  referrer_id uuid,
  referred_id uuid,
  referred_name text,
  code_used text,
  status text,
  created_at timestamptz,
  qualified_at timestamptz,
  rewarded_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.id,
    r.referrer_id,
    r.referred_id,
    nullif(split_part(trim(coalesce(p.name, '')), ' ', 1), '') as referred_name,
    r.code_used,
    r.status,
    r.created_at,
    r.qualified_at,
    r.rewarded_at
  from public.referrals r
  left join public.profiles p on p.id = r.referred_id
  where r.referrer_id = auth.uid()
  order by r.created_at desc;
$$;

revoke all on function public.get_my_referrals() from public;
grant execute on function public.get_my_referrals() to authenticated;

-- ===== END folded: 20260919130000_referral_history_rpc.sql =====

-- ===== BEGIN folded: 20260920120000_null_year_course_fallback.sql =====
-- ============================================================================
-- TEMPORARY – remove after min app version X
-- ============================================================================
-- Old app builds (and every backfilled BAMS student) have profiles.course_id
-- set but profiles.year_id NULL until they update the app and pick a year.
-- Under the strict rule in 20260919120000 such a student sees NO free content.
--
-- Fallback: a student whose profile has course_id set but year_id NULL may see
-- all ACTIVE content of their OWN course. Nothing else changes:
--   * course isolation stays strict (pr.course_id must equal p_course_id;
--     a NULL course never matches),
--   * once year_id is set the strict course+year rule applies again,
--   * the purchase branch and the admin branch are unchanged,
--   * storage is untouched: PDFs are still gated by user_owns_chapter()
--     (purchase-based), exactly as for a student who has picked a year.
--
-- The whole change is the single line marked "TEMPORARY" below. To remove it,
-- see "Removing the NULL-year fallback" in docs/multi-course-changes.md.
-- ============================================================================
create or replace function public.has_content_access(p_course_id text, p_year_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.am_i_admin()
    or exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.course_id = p_course_id
        and (
          p_year_id is null
          or pr.year_id = p_year_id
          or pr.year_id is null   -- TEMPORARY – remove after min app version X
        )
    )
    or exists (
      select 1
      from public.purchases pu
      left join public.chapters ch on pu.scope = 'chapter' and ch.id = pu.chapter_id
      left join public.subjects sb on pu.scope = 'subject' and sb.id = pu.subject_id
      where pu.user_id = auth.uid()
        and pu.status = 'success'
        and pu.course_id = p_course_id
        and (
          p_year_id is null
          or (pu.scope = 'year' and pu.year_id = p_year_id)
          or (pu.scope = 'bundle' and p_year_id = any(pu.year_ids))
          or (pu.scope = 'chapter' and ch.year_id = p_year_id)
          or (pu.scope = 'subject' and sb.year_id = p_year_id)
        )
    );
$$;

-- ===== END folded: 20260920120000_null_year_course_fallback.sql =====

-- ===== BEGIN folded: 20260920130000_app_config.sql =====
-- ============================================================================
-- app_config: small key/value table for remote app configuration.
-- Used by the mobile force-update gate (min_app_version, store_url).
--
-- !! PUBLICLY READABLE (anon + authenticated). Store ONLY non-secret values
-- !! here - never API secrets, keys, tokens or personal data.
--
-- Read: anyone. Write (insert/update/delete): admins only (am_i_admin()).
-- ============================================================================
create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  -- Defence in depth against a typo locking every student out of the app.
  constraint app_config_min_app_version_format
    check (key <> 'min_app_version' or value ~ '^[0-9]+(\.[0-9]+){0,2}$'),
  constraint app_config_store_url_https
    check (key <> 'store_url' or value ~ '^https://')
);

create or replace function public.app_config_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_config_touch_updated_at on public.app_config;
create trigger app_config_touch_updated_at
  before update on public.app_config
  for each row execute function public.app_config_touch_updated_at();

alter table public.app_config enable row level security;

grant select on public.app_config to anon, authenticated;
grant insert, update, delete on public.app_config to authenticated;

drop policy if exists "app_config_public_read" on public.app_config;
create policy "app_config_public_read" on public.app_config
  for select to anon, authenticated using (true);

drop policy if exists "app_config_admin_insert" on public.app_config;
create policy "app_config_admin_insert" on public.app_config
  for insert to authenticated with check (public.am_i_admin());

drop policy if exists "app_config_admin_update" on public.app_config;
create policy "app_config_admin_update" on public.app_config
  for update to authenticated using (public.am_i_admin()) with check (public.am_i_admin());

drop policy if exists "app_config_admin_delete" on public.app_config;
create policy "app_config_admin_delete" on public.app_config
  for delete to authenticated using (public.am_i_admin());

-- Seed: min_app_version equals the version in mobile-app/app.json at release
-- time so nobody is blocked on release day. Raise it from Admin -> Settings
-- (or an admin-only UPDATE) when an older build must be retired.
-- store_url uses android.package from app.json.
insert into public.app_config (key, value) values
  ('min_app_version', '1.0.0'),
  ('store_url', 'https://play.google.com/store/apps/details?id=com.medveda.app')
on conflict (key) do nothing;

-- ===== END folded: 20260920130000_app_config.sql =====

-- ===== BEGIN folded: 20260920140000_default_new_profile_course.sql =====
-- ============================================================================
-- TEMPORARY – remove with the NULL-year fallback
-- ============================================================================
-- Until the new mobile build is live, signups from OLD app versions create a
-- profile with course_id NULL (the old app has no course picker), so they see
-- no content even with the NULL-year fallback (20260920120000).
--
-- Fix: when a profile is INSERTED with course_id NULL, default it to 'bams',
-- the only course the old app served. A profile inserted with any other
-- course (e.g. 'bhms') is left alone, and UPDATEs are never touched, so
-- set_my_course_year() and admin edits behave exactly as before.
--
-- Side effect on the NEW app: a fresh signup arrives at the course/year
-- picker with BAMS preselected (like a backfilled student) instead of empty.
-- It still has to choose a year, and can change the course there.
--
-- Separate trigger; profiles_before_write() is not modified.
-- Removal steps: docs/multi-course-changes.md ("Removing the NULL-year fallback").
-- ============================================================================
create or replace function public.profiles_temp_default_course()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.course_id is null
     and exists (select 1 from public.courses where id = 'bams') then
    new.course_id := 'bams';   -- TEMPORARY – remove with the NULL-year fallback
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_temp_default_course on public.profiles;
create trigger profiles_temp_default_course
  before insert on public.profiles
  for each row execute function public.profiles_temp_default_course();

-- ===== END folded: 20260920140000_default_new_profile_course.sql =====

-- ===== BEGIN folded: 20260921120000_analytics_retention.sql =====
-- ============================================================================
-- Retention jobs:
--   1. analytics_events older than 12 months (Privacy Policy: "usage events
--      are kept for up to 12 months").
--   2. payment_sessions older than 30 days (short-lived checkout links; they
--      carry user_id and have no reason to outlive their 15-minute validity).
--
-- - Adds an index on created_at (analytics_events) so the purge does not scan.
-- - purge_old_analytics_events() / purge_old_payment_sessions() do the deletes;
--   they are not callable by app roles.
-- - Daily pg_cron jobs (03:30 and 03:40 UTC) run them. pg_cron is NOT installed on the
--   live database today, so scheduling is guarded: if the extension cannot be
--   enabled the migration still succeeds, raises a NOTICE, and you can either
--   enable pg_cron (Dashboard -> Database -> Extensions) and re-run this
--   migration's DO block, or call the function from any other scheduler.
-- Idempotent: safe to run more than once.
-- ============================================================================

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at);

create or replace function public.purge_old_analytics_events()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  delete from public.analytics_events
   where created_at < now() - interval '12 months';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_old_analytics_events() from public, anon, authenticated;
grant execute on function public.purge_old_analytics_events() to service_role;

create index if not exists payment_sessions_created_at_idx
  on public.payment_sessions (created_at);

create or replace function public.purge_old_payment_sessions()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  delete from public.payment_sessions
   where created_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_old_payment_sessions() from public, anon, authenticated;
grant execute on function public.purge_old_payment_sessions() to service_role;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
      begin
        create extension pg_cron;
      exception when others then
        raise notice 'analytics retention: could not enable pg_cron (%). Job not scheduled.', sqlerrm;
      end;
    end if;
  end if;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- cron.schedule() with an existing job name updates that job (idempotent).
    perform cron.schedule(
      'purge-analytics-events-12m',
      '30 3 * * *',
      'select public.purge_old_analytics_events()'
    );
    perform cron.schedule(
      'purge-payment-sessions-30d',
      '40 3 * * *',
      'select public.purge_old_payment_sessions()'
    );
  else
    raise notice 'analytics retention: pg_cron is not available - purge functions created but NOT scheduled.';
  end if;
end
$$;

-- ===== END folded: 20260921120000_analytics_retention.sql =====

-- ===== BEGIN folded: 20260921130000_account_deletion_support.sql =====
-- ============================================================================
-- Account deletion support (Privacy Policy / delete-account page).
--
-- Payment, order and invoice records must be kept for up to 8 years, but
-- orders.user_id / payments.user_id were NOT NULL ... ON DELETE CASCADE, so
-- deleting the auth user wiped them. This migration:
--   1. makes orders.user_id and payments.user_id nullable and switches their
--      FKs to ON DELETE SET NULL (rows survive, anonymised; RLS "own rows"
--      checks compare user_id = auth.uid(), so null rows are invisible to
--      students and still visible to admins).
--   2. guards grant_razorpay_payment() for orders whose user is gone.
--   3. adds erase_user_data(uuid): one atomic, idempotent transaction that
--      removes/anonymises everything for a user. Only service_role (the
--      delete-account Edge Function) may call it.
--   4. drops the old public.delete_my_account() RPC, which was callable by
--      any signed-in user and deleted payments/orders/purchases outright.
--      (git history of mobile-app never referenced it; the app uses the
--      delete-account Edge Function.)
-- Idempotent: safe to run more than once.
-- ============================================================================

alter table public.orders   alter column user_id drop not null;
alter table public.payments alter column user_id drop not null;

alter table public.orders   drop constraint if exists orders_user_id_fkey;
alter table public.orders   add constraint orders_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.payments drop constraint if exists payments_user_id_fkey;
alter table public.payments add constraint payments_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

CREATE OR REPLACE FUNCTION public.grant_razorpay_payment(p_event_id text, p_razorpay_order_id text, p_razorpay_payment_id text, p_amount_paise bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_product_title text;
  v_existing_payment_order_id text;
begin
  if p_event_id is null or p_razorpay_order_id is null or p_razorpay_payment_id is null
    or p_amount_paise <= 0 then
    raise exception 'invalid Razorpay settlement parameters';
  end if;

  select * into v_order
  from public.orders
  where razorpay_order_id = p_razorpay_order_id
  for update;

  if not found then
    raise exception 'Razorpay order % is not linked to an internal order', p_razorpay_order_id;
  end if;
  if round(v_order.amount * 100)::bigint <> p_amount_paise then
    raise exception 'Razorpay amount does not match order amount';
  end if;

  -- The student deleted their account (orders.user_id is now null) while this
  -- payment was in flight. Money was captured, so keep the accounting record
  -- (order marked paid + payment row, both anonymous) but grant nothing and
  -- touch no referral. Returning normally makes the webhook ack so Razorpay
  -- does not retry forever. Such payments need a manual refund in Razorpay.
  if v_order.user_id is null then
    insert into public.payments (
      order_id, user_id, product_id, amount, razorpay_order_id,
      razorpay_payment_id, status, verified_at
    ) values (
      v_order.id, null, v_order.product_id, v_order.amount,
      p_razorpay_order_id, p_razorpay_payment_id, 'success', now()
    ) on conflict (razorpay_payment_id) do nothing;

    update public.orders
    set status = 'paid', razorpay_payment_id = p_razorpay_payment_id, updated_at = now()
    where id = v_order.id;

    insert into public.razorpay_webhook_events(event_id, razorpay_payment_id, event_type)
    values (p_event_id, p_razorpay_payment_id, 'payment.captured')
    on conflict (event_id) do nothing;

    raise warning 'grant_razorpay_payment: payment % for order % arrived after the account was deleted; no access granted - refund manually', p_razorpay_payment_id, v_order.id;
    return;
  end if;

  select * into v_product from public.products where id = v_order.product_id;
  if not found then
    raise exception 'Order % references unknown product %', v_order.id, v_order.product_id;
  end if;
  v_product_title := coalesce(v_product.title, 'Your content');

  select order_id into v_existing_payment_order_id
  from public.payments
  where razorpay_payment_id = p_razorpay_payment_id;
  if found and v_existing_payment_order_id <> v_order.id then
    raise exception 'Razorpay payment is already linked to another order';
  end if;

  insert into public.payments (
    order_id, user_id, product_id, amount, razorpay_order_id,
    razorpay_payment_id, status, verified_at
  ) values (
    v_order.id, v_order.user_id, v_order.product_id, v_order.amount,
    p_razorpay_order_id, p_razorpay_payment_id, 'success', now()
  ) on conflict (razorpay_payment_id) do nothing;

  insert into public.purchases (
    user_id, order_id, product_id, product_title, scope, chapter_id,
    subject_id, year_id, year_ids, course_id, amount, status, razorpay_order_id
  ) values (
    v_order.user_id, v_order.id, v_product.id, v_product_title,
    v_product.scope, v_product.chapter_id, v_product.subject_id, v_product.year_id,
    v_product.year_ids, v_product.course_id, v_order.amount, 'success', p_razorpay_order_id
  ) on conflict (order_id) do nothing;

  update public.orders
  set status = 'paid', razorpay_payment_id = p_razorpay_payment_id,
      course_id = v_product.course_id, updated_at = now()
  where id = v_order.id;

  -- Referral qualification for qualify_on = 'first_purchase' (idempotent:
  -- only rows still 'pending' are touched).
  update public.referrals
  set status = 'qualified', qualified_at = now()
  where referred_id = v_order.user_id
    and status = 'pending'
    and exists (
      select 1 from public.referral_settings where id = true and qualify_on = 'first_purchase'
    );

  insert into public.razorpay_webhook_events(event_id, razorpay_payment_id, event_type)
  values (p_event_id, p_razorpay_payment_id, 'payment.captured')
  on conflict (event_id) do nothing;
end;
$function$;

create or replace function public.erase_user_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb := '{}'::jsonb;
  n bigint;
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;

  -- Admin accounts are referenced by admins.id (no cascade); refuse.
  if exists (select 1 from public.admins where id = p_user_id) then
    return jsonb_build_object('status', 'admin_blocked');
  end if;

  delete from public.analytics_events where user_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('analytics_events', n);
  delete from public.quiz_scores where user_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('quiz_scores', n);
  delete from public.push_tokens where user_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('push_tokens', n);
  delete from public.payment_sessions where user_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('payment_sessions', n);
  delete from public.purchases where user_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('purchases', n);
  delete from public.referrals where referrer_id = p_user_id or referred_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('referrals', n);

  -- Retained for tax/accounting: anonymise instead of delete.
  update public.payments set user_id = null where user_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('payments_anonymised', n);
  update public.orders set user_id = null where user_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('orders_anonymised', n);

  delete from public.profiles where id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('profiles', n);

  return jsonb_build_object('status', 'erased', 'counts', v_counts);
end;
$$;

revoke all on function public.erase_user_data(uuid) from public, anon, authenticated;
grant execute on function public.erase_user_data(uuid) to service_role;

-- MODIFIED FOR PHASE 1A: the original line below dropped delete_my_account().
-- It is kept as a backward-compatible wrapper so any released build or Edge
-- Function that still calls it keeps working. Original line:
--   drop function if exists public.delete_my_account();
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_res jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  -- Transaction-local flag so the orders guard (Phase 1A, part B2) lets this
  -- server-side cleanup anonymise the user's orders, including the FK
  -- ON DELETE SET NULL updates fired by the auth.users delete below. Only this
  -- function sets it; clients cannot set custom GUCs through the API.
  perform set_config('app.trusted_order_write', 'true', true);
  v_res := public.erase_user_data(v_uid);
  if v_res->>'status' = 'admin_blocked' then
    perform set_config('app.trusted_order_write', 'false', true);
    raise exception 'Admin accounts cannot be deleted from the app';
  end if;
  delete from auth.users where id = v_uid;
  perform set_config('app.trusted_order_write', 'false', true);
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ===== END folded: 20260921130000_account_deletion_support.sql =====

-- ############################################################################
-- PART B — SECURITY HARDENING
-- ############################################################################

-- ----------------------------------------------------------------------------
-- B1. grant_razorpay_payment(): server-only, and self-defending
-- ----------------------------------------------------------------------------
-- WHY: production granted EXECUTE to anon and authenticated (Supabase default
-- privileges add those roles directly, so `revoke ... from public` never
-- removed them). Any signed-in user could call the RPC with a forged order.
-- The only legitimate callers are the verify-payment and razorpay-webhook Edge
-- Functions, which use the service-role key AFTER verifying the Razorpay
-- signature / capture state with Razorpay.
--
-- The body is the 20260921130000 version plus one defence in depth: the order
-- must have gone through the server-side checkout (a payment_sessions row
-- created by create-payment-session exists) for exactly the product on the
-- order. This blocks a forged order and a product swap even if the grant were
-- ever exposed again.
create or replace function public.grant_razorpay_payment(
  p_event_id text,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_amount_paise bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_product_title text;
  v_existing_payment_order_id text;
  v_session_product text;
begin
  if p_event_id is null or p_razorpay_order_id is null or p_razorpay_payment_id is null
    or p_amount_paise <= 0 then
    raise exception 'invalid Razorpay settlement parameters';
  end if;

  select * into v_order
  from public.orders
  where razorpay_order_id = p_razorpay_order_id
  for update;

  if not found then
    raise exception 'Razorpay order % is not linked to an internal order', p_razorpay_order_id;
  end if;
  if round(v_order.amount * 100)::bigint <> p_amount_paise then
    raise exception 'Razorpay amount does not match order amount';
  end if;

  -- The student deleted their account while this payment was in flight. Money
  -- was captured, so keep the accounting record but grant nothing.
  if v_order.user_id is null then
    insert into public.payments (
      order_id, user_id, product_id, amount, razorpay_order_id,
      razorpay_payment_id, status, verified_at
    ) values (
      v_order.id, null, v_order.product_id, v_order.amount,
      p_razorpay_order_id, p_razorpay_payment_id, 'success', now()
    ) on conflict (razorpay_payment_id) do nothing;

    update public.orders
    set status = 'paid', razorpay_payment_id = p_razorpay_payment_id, updated_at = now()
    where id = v_order.id;

    insert into public.razorpay_webhook_events(event_id, razorpay_payment_id, event_type)
    values (p_event_id, p_razorpay_payment_id, 'payment.captured')
    on conflict (event_id) do nothing;

    raise warning 'grant_razorpay_payment: payment % for order % arrived after the account was deleted; no access granted - refund manually', p_razorpay_payment_id, v_order.id;
    return;
  end if;

  -- Defence in depth (new in Phase 1A). Does not depend on payment_sessions.used,
  -- so it is safe against whichever pay / create-payment-session version is deployed.
  if not exists (select 1 from public.payment_sessions ps where ps.order_id = v_order.id) then
    raise exception 'Order % has no completed checkout session', v_order.id;
  end if;
  if exists (select 1 from public.payment_sessions ps
             where ps.order_id = v_order.id and ps.product_id is distinct from v_order.product_id) then
    raise exception 'Order % product does not match its checkout session', v_order.id;
  end if;
  v_session_product := v_order.product_id;

  select * into v_product from public.products where id = v_session_product;
  if not found then
    raise exception 'Order % references unknown product %', v_order.id, v_session_product;
  end if;
  v_product_title := coalesce(v_product.title, 'Your content');

  select order_id into v_existing_payment_order_id
  from public.payments
  where razorpay_payment_id = p_razorpay_payment_id;
  if found and v_existing_payment_order_id <> v_order.id then
    raise exception 'Razorpay payment is already linked to another order';
  end if;

  insert into public.payments (
    order_id, user_id, product_id, amount, razorpay_order_id,
    razorpay_payment_id, status, verified_at
  ) values (
    v_order.id, v_order.user_id, v_order.product_id, v_order.amount,
    p_razorpay_order_id, p_razorpay_payment_id, 'success', now()
  ) on conflict (razorpay_payment_id) do nothing;

  insert into public.purchases (
    user_id, order_id, product_id, product_title, scope, chapter_id,
    subject_id, year_id, year_ids, course_id, amount, status, razorpay_order_id
  ) values (
    v_order.user_id, v_order.id, v_product.id, v_product_title,
    v_product.scope, v_product.chapter_id, v_product.subject_id, v_product.year_id,
    v_product.year_ids, v_product.course_id, v_order.amount, 'success', p_razorpay_order_id
  ) on conflict (order_id) do nothing;

  update public.orders
  set status = 'paid', razorpay_payment_id = p_razorpay_payment_id,
      course_id = v_product.course_id, updated_at = now()
  where id = v_order.id;

  -- Referral qualification for qualify_on = 'first_purchase' (idempotent).
  update public.referrals
  set status = 'qualified', qualified_at = now()
  where referred_id = v_order.user_id
    and status = 'pending'
    and exists (
      select 1 from public.referral_settings where id = true and qualify_on = 'first_purchase'
    );

  insert into public.razorpay_webhook_events(event_id, razorpay_payment_id, event_type)
  values (p_event_id, p_razorpay_payment_id, 'payment.captured')
  on conflict (event_id) do nothing;
end;
$function$;

-- Explicit, per-role. `from public` alone is NOT enough on Supabase.
revoke all on function public.grant_razorpay_payment(text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.grant_razorpay_payment(text, text, text, bigint)
  to service_role;

-- Not meant to be called by clients either (used only inside triggers).
revoke all on function public.generate_unique_referral_code(integer)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- B2. orders: immutable to students
-- ----------------------------------------------------------------------------
-- Privileged callers (Edge Functions with the service-role key, SECURITY
-- DEFINER functions such as grant_razorpay_payment, migrations, and admins)
-- are unrestricted. Everyone else is the `anon` / `authenticated` role.
create or replace function public.orders_guard_client_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.products%rowtype;
begin
  -- SECURITY DEFINER so the product lookup below is not filtered by the
  -- student's RLS. The caller is identified by the session `role` setting
  -- (PostgREST does SET LOCAL ROLE anon|authenticated|service_role), which
  -- is not changed by definer functions; migrations/psql report 'none'. The
  -- app.trusted_order_write flag is set only by delete_my_account() (above).
  if coalesce(current_setting('role', true), 'none') not in ('anon', 'authenticated')
     or coalesce(current_setting('app.trusted_order_write', true), 'false') = 'true'
     or public.am_i_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'created' then
      raise exception 'Orders can only be created with status created';
    end if;
    select * into v_p from public.products where id = new.product_id;
    if not found or not v_p.active then
      raise exception 'This product is not available';
    end if;
    -- Never trust client-written money or scope: derive it from the product.
    new.razorpay_order_id := null;
    new.razorpay_payment_id := null;
    new.amount := v_p.price;
    new.scope := v_p.scope;
    new.chapter_id := v_p.chapter_id;
    new.subject_id := v_p.subject_id;
    new.year_id := v_p.year_id;
    new.year_ids := v_p.year_ids;
    new.course_id := v_p.course_id;
    return new;
  end if;

  -- UPDATE by a student: only status may change (and updated_at).
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Orders cannot be edited';
  end if;
  if new.status is distinct from old.status then
    if old.status is distinct from 'created' or new.status not in ('cancelled', 'failed') then
      raise exception 'Order status can only be changed by the payment system';
    end if;
    if old.razorpay_payment_id is not null
       or exists (select 1 from public.payments p where p.order_id = old.id) then
      raise exception 'Order status can only be changed by the payment system';
    end if;
  end if;
  return new;
end;
$$;

-- Named so it sorts (and fires) before orders_before_write.
drop trigger if exists orders_00_guard_client_writes on public.orders;
create trigger orders_00_guard_client_writes
  before insert or update on public.orders
  for each row execute function public.orders_guard_client_writes();

-- Policies: drop the legacy permissive insert (allowed any status) and the
-- loose update; recreate strict ones. Admin / service paths are unaffected.
drop policy if exists "orders_insert_own" on public.orders;
drop policy if exists "Users can create own orders" on public.orders;
create policy "Users can create own orders" on public.orders
  for insert to authenticated
  with check (auth.uid() = user_id and status = 'created');

drop policy if exists "Users can cancel own pending orders" on public.orders;
create policy "Users can cancel own pending orders" on public.orders
  for update to authenticated
  using (auth.uid() = user_id and status = 'created')
  with check (auth.uid() = user_id and status in ('cancelled', 'failed'));

-- ----------------------------------------------------------------------------
-- B3. profiles: students update only their own row (protected columns are
--     enforced by profiles_before_write() from PART A)
-- ----------------------------------------------------------------------------
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "user update own profile" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- B4. DEFERRED to Phase 1B (separate migration, after old app builds are gone):
--     notes bucket private, legacy public-read policy dropped, free-preview
--     rule. Nothing about storage is changed in Phase 1A.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- B5. Self-checks. Any failure raises and rolls back the WHOLE migration.
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
  r record;
begin
  -- settlement RPC must not be callable by clients
  if has_function_privilege('anon', 'public.grant_razorpay_payment(text,text,text,bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.grant_razorpay_payment(text,text,text,bigint)', 'execute') then
    raise exception 'B5: grant_razorpay_payment is still executable by anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.grant_razorpay_payment(text,text,text,bigint)', 'execute') then
    raise exception 'B5: service_role lost EXECUTE on grant_razorpay_payment';
  end if;

  -- no other privileged function exposed
  foreach v_bad in array array[
    'public.erase_user_data(uuid)',
    'public.purge_old_analytics_events()',
    'public.purge_old_payment_sessions()'
  ] loop
    if has_function_privilege('anon', v_bad, 'execute') or has_function_privilege('authenticated', v_bad, 'execute') then
      raise exception 'B5: % is executable by a client role', v_bad;
    end if;
  end loop;

  -- delete_my_account() must still exist (backward compatible), signed-in users only
  if to_regprocedure('public.delete_my_account()') is null then
    raise exception 'B5: delete_my_account() wrapper is missing';
  end if;
  if has_function_privilege('anon', 'public.delete_my_account()', 'execute') then
    raise exception 'B5: delete_my_account() is executable by anon';
  end if;

  -- legacy permissive order-insert policy gone, guard present
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_insert_own') then
    raise exception 'B5: legacy orders_insert_own still present';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'orders_00_guard_client_writes' and not tgisinternal) then
    raise exception 'B5: orders guard trigger missing';
  end if;

  -- Phase 1A must NOT change buckets or the legacy notes public-read policy
  -- (both are reserved for Phase 1B)
  if exists (select 1 from _phase1_buckets b join storage.buckets x on x.id = b.id where b.public is distinct from x.public) then
    raise exception 'B5: a storage bucket public flag changed (reserved for Phase 1B)';
  end if;
  if exists (select 1 from _phase1_policies where policyname = 'public read notes/thumbnails')
     and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                     and policyname = 'public read notes/thumbnails') then
    raise exception 'B5: legacy notes public-read policy was removed (reserved for Phase 1B)';
  end if;

  -- nothing lost
  for r in
    select c.t, c.n as before_n,
      case c.t
        when 'profiles' then (select count(*) from public.profiles)
        when 'orders' then (select count(*) from public.orders)
        when 'purchases' then (select count(*) from public.purchases)
        when 'payments' then (select count(*) from public.payments)
        when 'auth_users' then (select count(*) from auth.users)
        when 'products' then (select count(*) from public.products)
      end as after_n
    from _phase1_counts c
  loop
    if r.before_n is distinct from r.after_n then
      raise exception 'B5: row count changed for % (% -> %)', r.t, r.before_n, r.after_n;
    end if;
  end loop;

  raise notice 'Phase 1A migration self-checks passed.';
end;
$$;

commit;
