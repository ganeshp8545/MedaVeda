-- ============================================================================
-- Step 2 of 2: run AFTER legacy_backfill_seed.sql and the multi-course
-- migrations. Checks the backfill and that existing purchases still unlock.
-- Read-only (transaction is rolled back). Run with -v ON_ERROR_STOP=1.
-- ============================================================================
begin;

create function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.back() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;

-- Row counts are unchanged and every content row landed in BAMS.
do $$
declare bad int;
begin
  if (select count(*) from public.years) <> 2 or (select count(*) from public.subjects) <> 3
     or (select count(*) from public.chapters) <> 4 or (select count(*) from public.notes) <> 4
     or (select count(*) from public.products) <> 4 or (select count(*) from public.orders) <> 5
     or (select count(*) from public.purchases) <> 5 then
    raise exception 'row counts changed during the migration'; end if;

  select count(*) into bad from (
    select course_id from public.years union all select course_id from public.subjects
    union all select course_id from public.chapters union all select course_id from public.notes
    union all select course_id from public.videos union all select course_id from public.quiz_tests
    union all select course_id from public.products union all select course_id from public.orders
    union all select course_id from public.purchases) t where course_id is distinct from 'bams';
  if bad <> 0 then raise exception '% rows are not in BAMS', bad; end if;

  if exists (select 1 from public.chapters where year_id is null) then raise exception 'chapter year_id not backfilled'; end if;
  if exists (select 1 from public.notes n join public.chapters c on c.id = n.chapter_id where n.year_id is distinct from c.year_id) then
    raise exception 'notes.year_id does not match its chapter'; end if;
  if (select course_id from public.products where id = 'p-bun') <> 'bams' then raise exception 'bundle product course'; end if;
  raise notice 'PASS A: row counts unchanged; every content row, order and purchase is in BAMS; notes/chapters got their year_id';
end $$;

-- Students: BAMS backfilled, year left null, referral codes generated & unique.
do $$
begin
  if exists (select 1 from public.profiles where course_id is distinct from 'bams' or year_id is not null) then
    raise exception 'profiles not backfilled to bams with a null year'; end if;
  if (select count(*) from public.profiles) <> (select count(distinct referral_code) from public.profiles)
     or exists (select 1 from public.profiles where referral_code is null) then
    raise exception 'referral codes missing or duplicated'; end if;
  raise notice 'PASS B: existing students are BAMS with no year yet; each has a unique referral code';
end $$;

-- Existing purchases still unlock exactly what they did before.
do $$
declare n int;
begin
  perform pg_temp.act_as('11111111-1111-4111-8111-111111111111');   -- chapter c1
  if not public.user_owns_chapter('c1') or public.user_owns_chapter('c2') then raise exception 'chapter purchase wrong'; end if;
  select count(*) into n from storage.objects where name in ('n1.pdf','n2.pdf','n3.pdf','n4.pdf');
  if n <> 1 then raise exception 'chapter buyer sees % PDFs, expected 1', n; end if;

  perform pg_temp.act_as('22222222-2222-4222-8222-222222222222');   -- subject s1 (c1,c2)
  if not (public.user_owns_chapter('c1') and public.user_owns_chapter('c2')) or public.user_owns_chapter('c3') then
    raise exception 'subject purchase wrong'; end if;
  select count(*) into n from storage.objects where name in ('n1.pdf','n2.pdf','n3.pdf','n4.pdf');
  if n <> 2 then raise exception 'subject buyer sees % PDFs, expected 2', n; end if;

  perform pg_temp.act_as('33333333-3333-4333-8333-333333333333');   -- year y1 + legacy y2 row without product_id
  if not (public.user_owns_chapter('c1') and public.user_owns_chapter('c3') and public.user_owns_chapter('c4')) then
    raise exception 'year purchases wrong (incl. the row with no product_id)'; end if;

  perform pg_temp.act_as('44444444-4444-4444-8444-444444444444');   -- bundle y1+y2
  select count(*) into n from storage.objects where name in ('n1.pdf','n2.pdf','n3.pdf','n4.pdf');
  if n <> 4 then raise exception 'bundle buyer sees % PDFs, expected 4', n; end if;

  perform pg_temp.act_as('55555555-5555-4555-8555-555555555555');   -- unpaid order only
  select count(*) into n from storage.objects where name in ('n1.pdf','n2.pdf','n3.pdf','n4.pdf');
  if n <> 0 or public.user_owns_chapter('c1') then raise exception 'unpaid order unlocked something'; end if;
  perform pg_temp.back();
  raise notice 'PASS C: chapter/subject/year/bundle purchases (and a legacy purchase with no product_id) still unlock exactly their PDFs; an unpaid order unlocks nothing';
end $$;

-- Content visibility for students who have not picked a year yet.
do $$
declare n int;
begin
  perform pg_temp.act_as('55555555-5555-4555-8555-555555555555');
  select count(*) into n from public.subjects;
  if n <> 0 then raise exception 'a student with no year sees % subjects', n; end if;
  perform pg_temp.act_as('22222222-2222-4222-8222-222222222222');   -- bought subject s1 (year y1)
  select count(*) into n from public.subjects;
  if n <> 2 then raise exception 'subject buyer with no year sees % subjects, expected 2 (the year they bought into)', n; end if;
  perform pg_temp.back();
  raise notice 'PASS D: until a year is chosen a student sees no free content, only what they bought (so the year picker must run first)';
end $$;

rollback;
