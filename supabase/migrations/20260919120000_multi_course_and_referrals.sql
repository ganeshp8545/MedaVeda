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
--   - No duplicate/conflicting RLS policy names exist today (verify with
--     `select * from pg_policies where schemaname='public'` before/after).
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

begin;

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

-- Reuses the generic updated_at-touch function already introduced by
-- 20260801_auth_verified_identities.sql (body is table-agnostic).
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
do $$
declare
  r record;
begin
  for r in select id from public.profiles where referral_code is null loop
    update public.profiles set referral_code = public.generate_unique_referral_code() where id = r.id;
  end loop;
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

commit;
