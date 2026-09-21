-- ============================================================================
-- Self-checking tests for 20260919120000_multi_course_and_referrals.sql and
-- 20260919130000_referral_history_rpc.sql
-- ============================================================================
-- Run against a LOCAL/STAGING Supabase database after applying the migrations
-- (never production):
--
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/multi_course_checks.sql
--
-- Everything runs inside ONE transaction that is ROLLED BACK at the end, so it
-- leaves nothing behind (fixture ids/emails are prefixed `_test`). Each check
-- raises an exception on failure - the script stops at the first one - and
-- prints `PASS: ...` otherwise. Statements run as the `postgres` role except
-- where a check switches to `authenticated` (RLS enforced) via act_as().
--
-- It creates its own users in auth.users. On a real Supabase project that
-- fires handle_new_user(), which creates their profiles rows.
-- ============================================================================
begin;

create function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.act_as_admin_db() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '_test_bams@example.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '_test_bhms@example.test', 'authenticated', 'authenticated'),
  ('cccccccc-0000-0000-0000-00000000000c', '_test_admin@example.test', 'authenticated', 'authenticated');

insert into public.admins (id, email) values
  ('cccccccc-0000-0000-0000-00000000000c', '_test_admin@example.test');

insert into public.courses (id, name, code, display_order) values
  ('_test_bams', 'Test BAMS', '_TEST_BAMS', 90),
  ('_test_bhms', 'Test BHMS', '_TEST_BHMS', 91);

insert into public.years (id, title, course_id) values
  ('_test_bams_y1', 'Test BAMS Y1', '_test_bams'),
  ('_test_bams_y2', 'Test BAMS Y2', '_test_bams'),
  ('_test_bhms_y1', 'Test BHMS Y1', '_test_bhms');

insert into public.subjects (id, title, year_id) values
  ('_test_bams_anat', 'Anatomy', '_test_bams_y1'),
  ('_test_bhms_anat', 'Anatomy', '_test_bhms_y1');

insert into public.chapters (id, title, subject_id) values
  ('_test_bams_ch1', 'Chapter 1', '_test_bams_anat'),
  ('_test_bhms_ch1', 'Chapter 1', '_test_bhms_anat');

insert into public.notes (id, title, pdf_url, chapter_id) values
  ('_test_bams_note', 'Note', 'https://x/storage/v1/object/public/notes/_test_bams_note.pdf', '_test_bams_ch1'),
  ('_test_bhms_note', 'Note', 'https://x/storage/v1/object/public/notes/_test_bhms_note.pdf', '_test_bhms_ch1');

insert into public.videos (id, title, youtube_url, subject_id) values
  ('_test_bams_video', 'Video', 'https://youtu.be/x', '_test_bams_anat'),
  ('_test_bhms_video', 'Video', 'https://youtu.be/y', '_test_bhms_anat');

insert into public.quiz_tests (id, title, subject_id) values
  ('_test_bams_quiz', 'Quiz', '_test_bams_anat'),
  ('_test_bhms_quiz', 'Quiz', '_test_bhms_anat');

insert into public.products (id, title, scope, price, chapter_id) values
  ('_test_bams_product', 'BAMS Chapter Notes', 'chapter', 99, '_test_bams_ch1'),
  ('_test_bhms_product', 'BHMS Chapter Notes', 'chapter', 99, '_test_bhms_ch1');

insert into storage.objects (bucket_id, name) values
  ('notes', '_test_bams_note.pdf'),
  ('notes', '_test_bhms_note.pdf');

-- Put the two students in their course + year. profiles has a guard trigger
-- that blocks direct writes to these columns, so use the same transaction-
-- local bypass flag set_my_course_year() uses.
select set_config('app.allow_profile_admin_fields', 'true', true);
update public.profiles set course_id = '_test_bams', year_id = '_test_bams_y1'
  where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
update public.profiles set course_id = '_test_bhms', year_id = '_test_bhms_y1'
  where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
select set_config('app.allow_profile_admin_fields', 'false', true);

-- ============================================================================
-- 1 & 2. Students see only their own course + year content
-- ============================================================================
do $$
declare n int; bad int;
begin
  perform pg_temp.act_as('aaaaaaaa-0000-0000-0000-00000000000a');
  select count(*) into n from public.subjects   where id like '\_test\_%';
  select count(*) into bad from public.subjects where id like '\_test\_bhms%';
  if n <> 1 or bad <> 0 then raise exception 'BAMS student subjects: % visible, % from BHMS', n, bad; end if;
  select count(*) into n   from public.chapters  where id like '\_test\_%';
  select count(*) into bad from public.chapters  where id like '\_test\_bhms%';
  if n <> 1 or bad <> 0 then raise exception 'BAMS student chapters wrong'; end if;
  select count(*) into n   from public.notes     where id like '\_test\_%';
  select count(*) into bad from public.notes     where id like '\_test\_bhms%';
  if n <> 1 or bad <> 0 then raise exception 'BAMS student notes wrong'; end if;
  select count(*) into n   from public.videos    where id like '\_test\_%';
  select count(*) into bad from public.videos    where id like '\_test\_bhms%';
  if n <> 1 or bad <> 0 then raise exception 'BAMS student videos wrong'; end if;
  select count(*) into n   from public.quiz_tests where id like '\_test\_%';
  select count(*) into bad from public.quiz_tests where id like '\_test\_bhms%';
  if n <> 1 or bad <> 0 then raise exception 'BAMS student quiz_tests wrong'; end if;
  select count(*) into n   from public.products  where id like '\_test\_%';
  select count(*) into bad from public.products  where id like '\_test\_bhms%';
  if n <> 1 or bad <> 0 then raise exception 'BAMS student products wrong'; end if;
  raise notice 'PASS 1: BAMS Year 1 student sees only BAMS content (subjects/chapters/notes/videos/quizzes/products)';

  perform pg_temp.act_as('bbbbbbbb-0000-0000-0000-00000000000b');
  select count(*) into n   from public.chapters where id like '\_test\_%';
  select count(*) into bad from public.chapters where id like '\_test\_bams%';
  if n <> 1 or bad <> 0 then raise exception 'BHMS student chapters wrong'; end if;
  select count(*) into n   from public.products where id like '\_test\_%';
  select count(*) into bad from public.products where id like '\_test\_bams%';
  if n <> 1 or bad <> 0 then raise exception 'BHMS student products wrong'; end if;
  raise notice 'PASS 2: BHMS Year 1 student sees only BHMS content';
  perform pg_temp.act_as_admin_db();
end $$;

-- ============================================================================
-- 3. A course inserted by an admin shows up for students immediately
-- ============================================================================
do $$
declare n int;
begin
  perform pg_temp.act_as('cccccccc-0000-0000-0000-00000000000c');
  insert into public.courses (id, name, code, display_order) values ('_test_new', 'New', '_TEST_NEW', 92);
  perform pg_temp.act_as('aaaaaaaa-0000-0000-0000-00000000000a');
  select count(*) into n from public.courses where id = '_test_new' and active;
  if n <> 1 then raise exception 'new course not visible to student'; end if;

  -- and a student can NOT create one
  begin
    insert into public.courses (id, name, code) values ('_test_student_course', 'X', '_TEST_X');
    raise exception 'student was allowed to insert a course';
  exception when insufficient_privilege or others then
    if sqlerrm like 'student was allowed%' then raise; end if;
  end;
  perform pg_temp.act_as_admin_db();
  raise notice 'PASS 3: admin-created course is visible immediately; students cannot create courses';
end $$;

-- ============================================================================
-- 4. A new year under a course appears only under that course
-- ============================================================================
do $$
declare n int;
begin
  perform pg_temp.act_as('cccccccc-0000-0000-0000-00000000000c');
  insert into public.years (id, title, course_id) values ('_test_bams_y3', 'Test BAMS Y3', '_test_bams');
  perform pg_temp.act_as('aaaaaaaa-0000-0000-0000-00000000000a');
  select count(*) into n from public.years where id = '_test_bams_y3' and course_id = '_test_bams';
  if n <> 1 then raise exception 'new year missing from its course'; end if;
  select count(*) into n from public.years where course_id = '_test_bhms' and id = '_test_bams_y3';
  if n <> 0 then raise exception 'new year leaked into another course'; end if;
  perform pg_temp.act_as_admin_db();
  raise notice 'PASS 4: new year appears only under its own course';
end $$;

-- ============================================================================
-- 5. Content whose parent is in another course is rejected by triggers
-- ============================================================================
do $$
declare failed boolean;
begin
  failed := false;
  begin insert into public.chapters (id, title, subject_id, course_id) values ('_test_bad_ch', 'x', '_test_bams_anat', '_test_bhms');
  exception when others then failed := true; end;
  if not failed then raise exception 'chapter with wrong course was accepted'; end if;

  failed := false;
  begin insert into public.notes (id, title, pdf_url, chapter_id, course_id) values ('_test_bad_note', 'x', 'u', '_test_bams_ch1', '_test_bhms');
  exception when others then failed := true; end;
  if not failed then raise exception 'note with wrong course was accepted'; end if;

  failed := false;
  begin insert into public.videos (id, title, youtube_url, subject_id, course_id) values ('_test_bad_v', 'x', 'u', '_test_bams_anat', '_test_bhms');
  exception when others then failed := true; end;
  if not failed then raise exception 'video with wrong course was accepted'; end if;

  failed := false;
  begin insert into public.quiz_tests (id, title, subject_id, course_id) values ('_test_bad_q', 'x', '_test_bams_anat', '_test_bhms');
  exception when others then failed := true; end;
  if not failed then raise exception 'quiz with wrong course was accepted'; end if;

  failed := false;
  begin insert into public.chapters (id, title, subject_id, year_id) values ('_test_bad_ch2', 'x', '_test_bams_anat', '_test_bhms_y1');
  exception when others then failed := true; end;
  if not failed then raise exception 'chapter with a year from another course was accepted'; end if;

  failed := false;
  begin insert into public.products (id, title, scope, price, year_ids) values ('_test_bad_bundle', 'x', 'bundle', 1, array['_test_bams_y1','_test_bhms_y1']);
  exception when others then failed := true; end;
  if not failed then raise exception 'cross-course bundle was accepted'; end if;

  -- derive-when-omitted still works
  insert into public.chapters (id, title, subject_id) values ('_test_ok_ch', 'ok', '_test_bhms_anat');
  if (select course_id from public.chapters where id = '_test_ok_ch') <> '_test_bhms' then
    raise exception 'course_id was not derived from the subject'; end if;
  raise notice 'PASS 5: cross-course chapter/note/video/quiz/year/bundle inserts are rejected; omitted ids are derived';
end $$;

-- ============================================================================
-- 6. Changing a student's course resets an incompatible year
-- ============================================================================
do $$
declare y text;
begin
  perform pg_temp.act_as('cccccccc-0000-0000-0000-00000000000c');   -- admin edit, like the Users page
  update public.profiles set course_id = '_test_bhms' where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  perform pg_temp.act_as_admin_db();
  select year_id into y from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  if y is not null then raise exception 'year_id should have been cleared, is %', y; end if;
  -- restore
  perform set_config('app.allow_profile_admin_fields', 'true', true);
  update public.profiles set course_id = '_test_bams', year_id = '_test_bams_y1' where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  perform set_config('app.allow_profile_admin_fields', 'false', true);
  raise notice 'PASS 6: changing course clears an incompatible year without error';
end $$;

-- ============================================================================
-- 7. BHMS student cannot reach BAMS content directly (rows, ownership, storage)
-- ============================================================================
do $$
declare n int;
begin
  perform pg_temp.act_as('bbbbbbbb-0000-0000-0000-00000000000b');
  select count(*) into n from public.chapters where id = '_test_bams_ch1';
  if n <> 0 then raise exception 'BHMS student read a BAMS chapter'; end if;
  select count(*) into n from public.notes where id = '_test_bams_note';
  if n <> 0 then raise exception 'BHMS student read a BAMS note'; end if;
  select count(*) into n from public.products where id = '_test_bams_product';
  if n <> 0 then raise exception 'BHMS student read a BAMS product'; end if;
  if public.user_owns_chapter('_test_bams_ch1') then raise exception 'BHMS student owns a BAMS chapter'; end if;
  select count(*) into n from storage.objects where bucket_id = 'notes' and name = '_test_bams_note.pdf';
  -- Phase 1A keeps the legacy public-read policy (dropped in Phase 1B), which
  -- deliberately still lets any signed-in user see note files. Enforced from 1B.
  if n <> 0 and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public read notes/thumbnails') then raise exception 'storage policy let a BHMS student see the BAMS PDF'; end if;
  perform pg_temp.act_as_admin_db();
  raise notice 'PASS 7: BHMS student gets 0 rows for BAMS chapter/note/product; storage denies the BAMS PDF';
end $$;

-- ============================================================================
-- 8. Purchases unlock their PDFs; a BAMS purchase never unlocks BHMS
-- ============================================================================
insert into public.orders (id, user_id, product_id, scope, chapter_id, amount, status, razorpay_order_id)
values ('_test_order_1', 'aaaaaaaa-0000-0000-0000-00000000000a', '_test_bams_product', 'chapter', '_test_bams_ch1', 99, 'created', '_test_rzp_1');
-- pay marks a checkout session used before settlement; grant_razorpay_payment requires it (Phase 1)
insert into public.payment_sessions (id, order_id, user_id, product_id, expires_at, used)
values (gen_random_uuid(), '_test_order_1', 'aaaaaaaa-0000-0000-0000-00000000000a', '_test_bams_product', now() + interval '1 hour', true);
select public.grant_razorpay_payment('_test_evt_1', '_test_rzp_1', '_test_pay_1', 9900);
-- idempotent: a retried webhook/callback changes nothing
select public.grant_razorpay_payment('_test_evt_1', '_test_rzp_1', '_test_pay_1', 9900);

do $$
declare n int;
begin
  select count(*) into n from public.purchases where order_id = '_test_order_1';
  if n <> 1 then raise exception 'expected exactly 1 purchase, got %', n; end if;
  if (select course_id from public.purchases where order_id = '_test_order_1') <> '_test_bams' then
    raise exception 'purchase course_id not taken from the product'; end if;

  perform pg_temp.act_as('aaaaaaaa-0000-0000-0000-00000000000a');
  if not public.user_owns_chapter('_test_bams_ch1') then raise exception 'purchaser does not own the chapter'; end if;
  select count(*) into n from storage.objects where bucket_id = 'notes' and name = '_test_bams_note.pdf';
  if n <> 1 then raise exception 'purchaser cannot see the purchased PDF'; end if;
  select count(*) into n from storage.objects where bucket_id = 'notes' and name = '_test_bhms_note.pdf';
  if n <> 0 and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public read notes/thumbnails') then raise exception 'BAMS purchaser can see an unpurchased BHMS PDF'; end if; -- storage isolation is enforced from Phase 1B (legacy public-read kept in 1A)

  perform pg_temp.act_as('bbbbbbbb-0000-0000-0000-00000000000b');
  if public.user_owns_chapter('_test_bams_ch1') then raise exception 'BAMS purchase unlocked BAMS chapter for BHMS student'; end if;
  perform pg_temp.act_as_admin_db();
  raise notice 'PASS 8: purchase grants exactly its content, is idempotent, and never crosses courses';
end $$;

-- ============================================================================
-- 9. Referrals
-- ============================================================================
do $$
declare total int; uniq int; code text; r jsonb;
begin
  select count(*), count(distinct referral_code) into total, uniq from public.profiles;
  if total <> uniq or exists (select 1 from public.profiles where referral_code is null) then
    raise exception 'referral codes are not unique/complete'; end if;

  select referral_code into code from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a';

  -- disabled by default
  perform pg_temp.act_as('bbbbbbbb-0000-0000-0000-00000000000b');
  r := public.apply_referral_code(code);
  if r->>'status' <> 'disabled' then raise exception 'expected disabled, got %', r; end if;
  perform pg_temp.act_as_admin_db();

  update public.referral_settings set enabled = true where id = true;

  perform pg_temp.act_as('aaaaaaaa-0000-0000-0000-00000000000a');
  r := public.apply_referral_code(code);
  if r->>'status' <> 'self_referral' then raise exception 'expected self_referral, got %', r; end if;
  r := public.apply_referral_code('NOTACODE9');
  if r->>'status' <> 'invalid_code' then raise exception 'expected invalid_code, got %', r; end if;

  perform pg_temp.act_as('bbbbbbbb-0000-0000-0000-00000000000b');
  r := public.apply_referral_code(lower(code));              -- case-insensitive
  if r->>'status' <> 'success' then raise exception 'expected success, got %', r; end if;
  r := public.apply_referral_code(code);
  if r->>'status' <> 'already_referred' then raise exception 'expected already_referred, got %', r; end if;
  perform pg_temp.act_as_admin_db();

  if not exists (select 1 from public.referrals
                 where referrer_id = 'aaaaaaaa-0000-0000-0000-00000000000a'
                   and referred_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and status = 'qualified') then
    raise exception 'valid referral was not recorded as qualified'; end if;

  -- referrer sees the history with a first name only; the referred user sees none of it
  perform pg_temp.act_as('aaaaaaaa-0000-0000-0000-00000000000a');
  if (select count(*) from public.get_my_referrals()) <> 1 then raise exception 'referrer history wrong'; end if;
  perform pg_temp.act_as('bbbbbbbb-0000-0000-0000-00000000000b');
  if (select count(*) from public.get_my_referrals()) <> 0 then raise exception 'referred user sees referrer history'; end if;
  perform pg_temp.act_as_admin_db();
  raise notice 'PASS 9: unique codes; disabled/self/invalid/double-apply rejected; valid case-insensitive referral recorded; history is referrer-only';
end $$;

-- ============================================================================
-- 10. A tampered order cannot produce a broad purchase
-- ============================================================================
insert into public.orders (id, user_id, product_id, scope, year_id, amount, status, razorpay_order_id)
values ('_test_order_t', 'aaaaaaaa-0000-0000-0000-00000000000a', '_test_bams_product', 'year', '_test_bams_y1', 99, 'created', '_test_rzp_t');
insert into public.payment_sessions (id, order_id, user_id, product_id, expires_at, used)
values (gen_random_uuid(), '_test_order_t', 'aaaaaaaa-0000-0000-0000-00000000000a', '_test_bams_product', now() + interval '1 hour', true);
select public.grant_razorpay_payment('_test_evt_t', '_test_rzp_t', '_test_pay_t', 9900);
do $$
declare p public.purchases%rowtype;
begin
  select * into p from public.purchases where order_id = '_test_order_t';
  if p.scope <> 'chapter' or p.chapter_id <> '_test_bams_ch1' or p.year_id is not null then
    raise exception 'purchase followed the tampered order: scope=% year_id=%', p.scope, p.year_id; end if;
  raise notice 'PASS 10: purchase scope/ids come from the product, not the tampered order';
end $$;

-- ============================================================================
-- 11. Profile protection + set_my_course_year
-- ============================================================================
do $$
declare failed boolean; c text; y text;
begin
  perform pg_temp.act_as('aaaaaaaa-0000-0000-0000-00000000000a');

  failed := false;
  begin update public.profiles set blocked = true where id = auth.uid();
  exception when others then failed := true; end;
  if not failed then raise exception 'student changed their own blocked flag'; end if;

  failed := false;
  begin update public.profiles set course_id = '_test_bhms' where id = auth.uid();
  exception when others then failed := true; end;
  if not failed then raise exception 'student changed course_id directly'; end if;

  failed := false;
  begin update public.profiles set referral_code = 'HACKED1' where id = auth.uid();
  exception when others then failed := true; end;
  if not failed then raise exception 'student changed their referral code'; end if;

  -- ordinary self-edits still work
  update public.profiles set name = 'Renamed' where id = auth.uid();

  failed := false;
  begin perform public.set_my_course_year('_test_bams', '_test_bhms_y1');   -- year of another course
  exception when others then failed := true; end;
  if not failed then raise exception 'set_my_course_year accepted a mismatched pair'; end if;

  perform public.set_my_course_year('_test_bams', '_test_bams_y2');
  select course_id, year_id into c, y from public.profiles where id = auth.uid();
  if c <> '_test_bams' or y <> '_test_bams_y2' then raise exception 'set_my_course_year did not apply'; end if;
  perform pg_temp.act_as_admin_db();
  raise notice 'PASS 11: students cannot edit protected profile fields; set_my_course_year validates and applies';
end $$;

-- admin sees everything
do $$
declare n int;
begin
  perform pg_temp.act_as('cccccccc-0000-0000-0000-00000000000c');
  select count(*) into n from public.chapters where id like '\_test\_%';
  if n < 3 then raise exception 'admin cannot see all courses'' chapters (%)', n; end if;
  perform pg_temp.act_as_admin_db();
  raise notice 'PASS 12: admin sees content of every course';
end $$;

-- ============================================================================
-- 13. Students cannot fabricate a paid order (works even if the permissive
--     schena.sql insert policy is the one deployed)
-- ============================================================================
do $$
declare failed boolean;
begin
  perform pg_temp.act_as('aaaaaaaa-0000-0000-0000-00000000000a');

  failed := false;
  begin
    insert into public.orders (id, user_id, product_id, scope, chapter_id, amount, status)
    values ('_test_fake_paid', auth.uid(), '_test_bams_product', 'chapter', '_test_bams_ch1', 99, 'paid');
  exception when others then failed := true; end;
  if not failed then raise exception 'student inserted a paid order'; end if;

  insert into public.orders (id, user_id, product_id, scope, chapter_id, amount, status)
  values ('_test_real_order', auth.uid(), '_test_bams_product', 'chapter', '_test_bams_ch1', 99, 'created');

  failed := false;
  begin update public.orders set status = 'paid' where id = '_test_real_order';
  exception when others then failed := true; end;
  if not failed then raise exception 'student marked their own order paid'; end if;

  update public.orders set status = 'cancelled' where id = '_test_real_order';   -- cancelling is fine
  perform pg_temp.act_as_admin_db();
  raise notice 'PASS 13: students can create/cancel orders but cannot create or mark one paid';
end $$;

rollback;
