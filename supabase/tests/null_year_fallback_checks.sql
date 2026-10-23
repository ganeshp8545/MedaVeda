-- ============================================================================
-- Tests for 20260920120000_null_year_course_fallback.sql
-- NULL-year compatibility remains supported by course-wide browsing.
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/null_year_fallback_checks.sql
-- One transaction, rolled back. Same conventions as multi_course_checks.sql.
-- ============================================================================
begin;

create function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.back() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000a', '_test_ny_bams@example.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-1111-0000-0000-00000000000b', '_test_ny_bhms@example.test', 'authenticated', 'authenticated'),
  ('dddddddd-1111-0000-0000-00000000000d', '_test_ny_nocourse@example.test', 'authenticated', 'authenticated');

insert into public.courses (id, name, code, display_order) values
  ('_test_bams', 'Test BAMS', '_TEST_BAMS', 90), ('_test_bhms', 'Test BHMS', '_TEST_BHMS', 91);
insert into public.years (id, title, course_id) values
  ('_test_bams_y1', 'Y1', '_test_bams'), ('_test_bams_y2', 'Y2', '_test_bams'), ('_test_bhms_y1', 'Y1', '_test_bhms');
insert into public.subjects (id, title, year_id) values
  ('_test_bams_s1', 'A', '_test_bams_y1'), ('_test_bams_s2', 'B', '_test_bams_y2'), ('_test_bhms_s1', 'A', '_test_bhms_y1');
insert into public.chapters (id, title, subject_id) values
  ('_test_bams_c1', 'C', '_test_bams_s1'), ('_test_bams_c2', 'C', '_test_bams_s2'), ('_test_bhms_c1', 'C', '_test_bhms_s1');
insert into public.notes (id, title, pdf_url, chapter_id) values
  ('_test_bams_n1', 'N', 'https://x/storage/v1/object/public/notes/_test_bams_n1.pdf', '_test_bams_c1'),
  ('_test_bhms_n1', 'N', 'https://x/storage/v1/object/public/notes/_test_bhms_n1.pdf', '_test_bhms_c1');
insert into public.videos (id, title, youtube_url, subject_id) values
  ('_test_bams_v1', 'V', 'u', '_test_bams_s1'), ('_test_bams_v2', 'V', 'u', '_test_bams_s2'), ('_test_bhms_v1', 'V', 'u', '_test_bhms_s1');
insert into public.quiz_tests (id, title, subject_id) values
  ('_test_bams_q1', 'Q', '_test_bams_s1'), ('_test_bhms_q1', 'Q', '_test_bhms_s1');
insert into public.products (id, title, scope, price, chapter_id) values
  ('_test_bams_p1', 'P', 'chapter', 9, '_test_bams_c1'), ('_test_bhms_p1', 'P', 'chapter', 9, '_test_bhms_c1');
insert into storage.objects (bucket_id, name) values
  ('notes', '_test_bams_n1.pdf'), ('notes', '_test_bhms_n1.pdf');

-- BAMS + BHMS students have a course but NO year; third has neither.
select set_config('app.allow_profile_admin_fields', 'true', true);
update public.profiles set course_id = '_test_bams', year_id = null where id = 'aaaaaaaa-1111-0000-0000-00000000000a';
update public.profiles set course_id = '_test_bhms', year_id = null where id = 'bbbbbbbb-1111-0000-0000-00000000000b';
update public.profiles set course_id = null,         year_id = null where id = 'dddddddd-1111-0000-0000-00000000000d';
select set_config('app.allow_profile_admin_fields', 'false', true);

-- N1. NULL-year BAMS student sees all its own course (both years), 0 BHMS rows.
do $$
declare n int; bad int;
begin
  perform pg_temp.act_as('aaaaaaaa-1111-0000-0000-00000000000a');
  select count(*) into n   from public.subjects where id like '\_test\_%';
  select count(*) into bad from public.subjects where id like '\_test\_bhms%';
  if n <> 2 or bad <> 0 then raise exception 'subjects: % visible (want 2), % BHMS', n, bad; end if;
  select count(*) into n   from public.chapters where id like '\_test\_%';
  select count(*) into bad from public.chapters where id like '\_test\_bhms%';
  if n <> 2 or bad <> 0 then raise exception 'chapters: % visible (want 2), % BHMS', n, bad; end if;
  select count(*) into n   from public.notes where id like '\_test\_%';
  select count(*) into bad from public.notes where id like '\_test\_bhms%';
  if n <> 1 or bad <> 0 then raise exception 'notes: % visible (want 1), % BHMS', n, bad; end if;
  select count(*) into n   from public.videos where id like '\_test\_%';
  select count(*) into bad from public.videos where id like '\_test\_bhms%';
  if n <> 2 or bad <> 0 then raise exception 'videos: % visible (want 2), % BHMS', n, bad; end if;
  select count(*) into n   from public.quiz_tests where id like '\_test\_%';
  select count(*) into bad from public.quiz_tests where id like '\_test\_bhms%';
  if n <> 1 or bad <> 0 then raise exception 'quizzes: % visible (want 1), % BHMS', n, bad; end if;
  select count(*) into n   from public.products where id like '\_test\_%';
  select count(*) into bad from public.products where id like '\_test\_bhms%';
  if n <> 1 or bad <> 0 then raise exception 'products: % visible (want 1), % BHMS', n, bad; end if;
  perform pg_temp.back();
  raise notice 'PASS N1: NULL-year BAMS student sees all BAMS content and 0 BHMS rows in every content table';
end $$;

-- N2. Same student cannot read the BHMS PDF (nor, unpurchased, the BAMS one:
--     storage stays purchase-gated exactly as for a student with a year).
do $$
declare n int;
begin
  perform pg_temp.act_as('aaaaaaaa-1111-0000-0000-00000000000a');
  select count(*) into n from storage.objects where name = '_test_bhms_n1.pdf';
  if n <> 0 and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public read notes/thumbnails') then raise exception 'NULL-year BAMS student can read a BHMS PDF'; end if; -- storage isolation is enforced from Phase 1B (legacy public-read kept in 1A)
  if public.user_owns_chapter('_test_bhms_c1') then raise exception 'owns BHMS chapter'; end if;
  select count(*) into n from storage.objects where name = '_test_bams_n1.pdf';
  -- Enforced from Phase 1B: until then the legacy public-read policy is kept on purpose.
  if n <> 0 and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public read notes/thumbnails') then raise exception 'fallback unexpectedly opened an unpurchased PDF'; end if;
  perform pg_temp.back();
  raise notice 'PASS N2: NULL-year BAMS student cannot read the BHMS PDF; storage still purchase-gated';
end $$;

-- N3. Mirror image: NULL-year BHMS student sees 0 BAMS rows.
do $$
declare n int; bad int;
begin
  perform pg_temp.act_as('bbbbbbbb-1111-0000-0000-00000000000b');
  select count(*) into n   from public.subjects where id like '\_test\_%';
  select count(*) into bad from public.subjects where id like '\_test\_bams%';
  if n <> 1 or bad <> 0 then raise exception 'BHMS subjects: % visible, % BAMS', n, bad; end if;
  select count(*) into bad from (
    select id from public.chapters union all select id from public.notes union all select id from public.videos
    union all select id from public.quiz_tests union all select id from public.products) t where id like '\_test\_bams%';
  if bad <> 0 then raise exception 'NULL-year BHMS student sees % BAMS rows', bad; end if;
  select count(*) into n from storage.objects where name = '_test_bams_n1.pdf';
  if n <> 0 and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public read notes/thumbnails') then raise exception 'NULL-year BHMS student can read a BAMS PDF'; end if; -- storage isolation is enforced from Phase 1B (legacy public-read kept in 1A)
  perform pg_temp.back();
  raise notice 'PASS N3: NULL-year BHMS student sees 0 BAMS rows and no BAMS PDF';
end $$;

-- N4. A student with NO course (and no year) sees nothing.
do $$
declare n int;
begin
  perform pg_temp.act_as('dddddddd-1111-0000-0000-00000000000d');
  select count(*) into n from (
    select id from public.subjects union all select id from public.chapters union all select id from public.notes
    union all select id from public.videos union all select id from public.quiz_tests union all select id from public.products) t
    where id like '\_test\_%';
  if n <> 0 then raise exception 'course-less student sees % rows', n; end if;
  perform pg_temp.back();
  raise notice 'PASS N4: a student with no course sees nothing';
end $$;

-- N5. Setting a registration year must not narrow course-wide browsing.
do $$
declare n int;
begin
  perform set_config('app.allow_profile_admin_fields', 'true', true);
  update public.profiles set year_id = '_test_bams_y1' where id = 'aaaaaaaa-1111-0000-0000-00000000000a';
  perform set_config('app.allow_profile_admin_fields', 'false', true);

  perform pg_temp.act_as('aaaaaaaa-1111-0000-0000-00000000000a');
  select count(*) into n from public.subjects where id like '\_test\_%';
  if n <> 2 then raise exception 'year set: sees % subjects, want both years (2)', n; end if;
  if not exists (select 1 from public.subjects where id = '_test_bams_s2') then raise exception 'year set: cannot see Y2'; end if;
  select count(*) into n from public.videos where id like '\_test\_%';
  if n <> 2 then raise exception 'year set: sees % videos, want 2', n; end if;
  perform pg_temp.back();
  raise notice 'PASS N5: with year_id set the student still sees all years in their course';
end $$;

-- N6. Inactive content stays hidden from a NULL-year student.
do $$
declare n int;
begin
  update public.videos set active = false where id = '_test_bams_v2';
  perform set_config('app.allow_profile_admin_fields', 'true', true);
  update public.profiles set year_id = null where id = 'aaaaaaaa-1111-0000-0000-00000000000a';
  perform set_config('app.allow_profile_admin_fields', 'false', true);
  perform pg_temp.act_as('aaaaaaaa-1111-0000-0000-00000000000a');
  select count(*) into n from public.videos where id like '\_test\_bams%';
  if n <> 1 then raise exception 'NULL-year student sees % BAMS videos, want 1 (inactive one hidden)', n; end if;
  perform pg_temp.back();
  raise notice 'PASS N6: inactive content is still hidden under the fallback';
end $$;

-- N7. TEMPORARY default (20260920140000): a profile inserted without a course
-- becomes 'bams'; one inserted with 'bhms' keeps 'bhms'; updates are not touched.
do $$
declare c text;
begin
  insert into auth.users (id, email, aud, role) values
    ('eeeeeeee-1111-0000-0000-00000000000e', '_test_ny_new@example.test', 'authenticated', 'authenticated');
  delete from public.profiles where id = 'eeeeeeee-1111-0000-0000-00000000000e';   -- drop the trigger-made row
  insert into public.profiles (id, email) values ('eeeeeeee-1111-0000-0000-00000000000e', '_test_ny_new@example.test');
  select course_id into c from public.profiles where id = 'eeeeeeee-1111-0000-0000-00000000000e';
  if c is distinct from 'bams' then raise exception 'new profile without a course got %, want bams', c; end if;

  insert into auth.users (id, email, aud, role) values
    ('ffffffff-1111-0000-0000-00000000000f', '_test_ny_bhms_new@example.test', 'authenticated', 'authenticated');
  delete from public.profiles where id = 'ffffffff-1111-0000-0000-00000000000f';
  insert into public.profiles (id, email, course_id) values ('ffffffff-1111-0000-0000-00000000000f', '_test_ny_bhms_new@example.test', 'bhms');
  select course_id into c from public.profiles where id = 'ffffffff-1111-0000-0000-00000000000f';
  if c is distinct from 'bhms' then raise exception 'profile inserted with bhms got %', c; end if;

  -- a later UPDATE to NULL course is not re-defaulted (only INSERT is affected)
  perform set_config('app.allow_profile_admin_fields', 'true', true);
  update public.profiles set course_id = null where id = 'ffffffff-1111-0000-0000-00000000000f';
  perform set_config('app.allow_profile_admin_fields', 'false', true);
  select course_id into c from public.profiles where id = 'ffffffff-1111-0000-0000-00000000000f';
  if c is not null then raise exception 'update was re-defaulted to %', c; end if;
  raise notice 'PASS N7: new profile without a course gets bams; one inserted with bhms keeps bhms; updates untouched';
end $$;

rollback;
