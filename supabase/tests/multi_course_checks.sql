-- ============================================================================
-- Manual verification checks for 20260919120000_multi_course_and_referrals.sql
-- ============================================================================
-- Run this against a LOCAL/STAGING Supabase project only, after applying the
-- migration — never against production. It creates and deletes its own
-- fixture rows (ids prefixed `_test_`) and is safe to re-run.
--
-- These exact statements (adapted for the local Postgres instance available
-- in this environment — no Docker/Supabase CLI here, see the final report)
-- were run during Phase 2 development and all produced the expected result
-- shown in each block's comment. Re-run them here against a real Supabase
-- project (with GoTrue/PostgREST/Storage actually wired up) before deploying,
-- since this environment could only approximate auth.uid()/storage.
--
-- Usage: each block sets the acting user via
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid>"}';
-- then runs as that user until the transaction ends. Wrap each numbered
-- block in its own `begin; ... rollback;` if you want zero side effects, or
-- run the whole file as-is and let the final cleanup section remove the
-- fixtures.
-- ============================================================================

-- --- fixtures -----------------------------------------------------------
insert into public.courses (id, name, code, display_order) values
  ('_test_bams', 'Test BAMS', '_TEST_BAMS', 90),
  ('_test_bhms', 'Test BHMS', '_TEST_BHMS', 91)
on conflict (id) do nothing;

insert into public.years (id, title, course_id) values
  ('_test_bams_y1', 'Test BAMS Y1', '_test_bams'),
  ('_test_bams_y2', 'Test BAMS Y2', '_test_bams'),
  ('_test_bhms_y1', 'Test BHMS Y1', '_test_bhms')
on conflict (id) do nothing;

insert into public.subjects (id, title, year_id) values
  ('_test_bams_anat', 'Test Anatomy', '_test_bams_y1'),
  ('_test_bhms_anat', 'Test Anatomy', '_test_bhms_y1')
on conflict (id) do nothing;

insert into public.chapters (id, title, subject_id) values
  ('_test_bams_ch1', 'Test Chapter 1', '_test_bams_anat'),
  ('_test_bhms_ch1', 'Test Chapter 1', '_test_bhms_anat')
on conflict (id) do nothing;

insert into public.notes (id, title, pdf_url, chapter_id) values
  ('_test_bams_note1', 'Test Note 1', 'https://example/storage/v1/object/public/notes/_test_bams_note1.pdf', '_test_bams_ch1'),
  ('_test_bhms_note1', 'Test Note 1', 'https://example/storage/v1/object/public/notes/_test_bhms_note1.pdf', '_test_bhms_ch1')
on conflict (id) do nothing;

insert into public.products (id, title, scope, price, chapter_id) values
  ('_test_bams_product', 'Test BAMS Chapter Notes', 'chapter', 99, '_test_bams_ch1')
on conflict (id) do nothing;

-- Replace these with two real auth.users ids from your project (e.g. two
-- disposable test accounts) before running — profiles.course_id/year_id
-- are set below via the admin bypass, not through signup.
-- :bams_student_uid  = '11111111-1111-1111-1111-111111111111'
-- :bhms_student_uid  = '22222222-2222-2222-2222-222222222222'

update public.profiles set course_id = '_test_bams', year_id = '_test_bams_y1'
  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set course_id = '_test_bhms', year_id = '_test_bhms_y1'
  where id = '22222222-2222-2222-2222-222222222222';

-- ============================================================================
-- 1. BAMS + Year 1 student sees only BAMS Year 1 content
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
-- Expect: only _test_bams_ch1 / _test_bams_note1 rows, never the bhms ones.
select id from public.chapters where id like '\_test\_%';
select id from public.notes where id like '\_test\_%';
reset role;

-- ============================================================================
-- 2. BHMS + Year 1 student sees only BHMS Year 1 content
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
-- Expect: only _test_bhms_ch1 / _test_bhms_note1 rows.
select id from public.chapters where id like '\_test\_%';
select id from public.notes where id like '\_test\_%';
reset role;

-- ============================================================================
-- 3. A new course inserted by admin appears in the active courses query
--    immediately (run as an admin session, or verify via the postgres role)
-- ============================================================================
insert into public.courses (id, name, code, display_order) values
  ('_test_new_course', 'Test New Course', '_TEST_NEW', 92)
on conflict (id) do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
-- Expect: _test_new_course is in the result immediately, no cache/refresh needed.
select id from public.courses where id = '_test_new_course';
reset role;

-- ============================================================================
-- 4. A new year under a course appears only for that course
-- ============================================================================
insert into public.years (id, title, course_id) values ('_test_bams_y3', 'Test BAMS Y3', '_test_bams')
  on conflict (id) do nothing;
-- Expect: appears under course_id = '_test_bams', never under '_test_bhms'.
select id, course_id from public.years where id like '\_test\_%';

-- ============================================================================
-- 5. Inserting a chapter/note/video/quiz_test whose parent belongs to
--    another course fails via trigger
-- ============================================================================
-- Run this manually (commented out so this file can be re-run end to end
-- without erroring out partway through):
--   insert into public.chapters (id, title, subject_id, course_id)
--   values ('_test_bad_chapter', 'Bad', '_test_bams_anat', '_test_bhms');
-- Expect: ERROR — chapters.course_id (_test_bhms) does not match its
-- subject's course (_test_bams)

-- ============================================================================
-- 6. Changing a student's course resets an incompatible year
-- ============================================================================
update public.profiles set course_id = '_test_bhms' where id = '11111111-1111-1111-1111-111111111111';
-- Expect: year_id is now null (was '_test_bams_y1', which doesn't belong to _test_bhms).
select course_id, year_id from public.profiles where id = '11111111-1111-1111-1111-111111111111';
-- revert
update public.profiles set course_id = '_test_bams', year_id = '_test_bams_y1'
  where id = '11111111-1111-1111-1111-111111111111';

-- ============================================================================
-- 7. A BHMS student selecting a BAMS chapter/note/product id directly gets
--    0 rows; storage policy denies the BAMS PDF
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
-- Expect: all three return 0 rows.
select id from public.chapters where id = '_test_bams_ch1';
select id from public.notes where id = '_test_bams_note1';
select id from public.products where id = '_test_bams_product';
-- Expect: false (BHMS student does not own the BAMS chapter).
select public.user_owns_chapter('_test_bams_ch1');
reset role;

-- ============================================================================
-- 8. Existing purchases still unlock their PDFs; existing content still
--    visible to its own course's users
-- ============================================================================
insert into public.orders (id, user_id, product_id, scope, chapter_id, amount, status, razorpay_order_id)
values ('_test_order_1', '11111111-1111-1111-1111-111111111111', '_test_bams_product', 'chapter', '_test_bams_ch1', 99, 'created', '_test_rzp_order_1')
on conflict (id) do nothing;
select public.grant_razorpay_payment('_test_evt_1', '_test_rzp_order_1', '_test_rzp_pay_1', 9900);
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
-- Expect: true.
select public.user_owns_chapter('_test_bams_ch1');
reset role;

-- ============================================================================
-- 9. Referral codes: unique, self-referral/double-referral/invalid rejected,
--    a valid referral is recorded
-- ============================================================================
select count(*) as total_profiles, count(distinct referral_code) as distinct_codes from public.profiles;
-- Expect: total_profiles = distinct_codes (every profile has a unique code).

update public.referral_settings set enabled = true where id = true;

-- Fetch the BAMS student's code as postgres/service-role first (a student
-- can only see their OWN profile row under RLS, so apply_referral_code's
-- caller can't look this up themselves — the code is meant to travel to
-- them out of band, e.g. shared via the app's Share sheet).
select referral_code from public.profiles where id = '11111111-1111-1111-1111-111111111111';
-- \gset bams_code   -- if running via psql, uncomment to capture it into :bams_code

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
-- Expect: {"status": "self_referral", ...}
select public.apply_referral_code((select referral_code from public.profiles where id = auth.uid()));
-- Expect: {"status": "invalid_code", ...}
select public.apply_referral_code('NOTACODE123');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
-- Replace 'PASTE_BAMS_STUDENTS_CODE_HERE' with the value printed above.
-- Expect: {"status": "success", ...}
select public.apply_referral_code('PASTE_BAMS_STUDENTS_CODE_HERE');
-- Expect on a second call: {"status": "already_referred", ...}
select public.apply_referral_code('PASTE_BAMS_STUDENTS_CODE_HERE');
reset role;

select referrer_id, referred_id, status from public.referrals
where referrer_id = '11111111-1111-1111-1111-111111111111';

-- ============================================================================
-- 10. A tampered order (cheap product, broad scope) cannot produce a broad
--     purchase — purchases always derive from the product, not the order
-- ============================================================================
insert into public.orders (id, user_id, product_id, scope, year_id, amount, status, razorpay_order_id)
values ('_test_order_tamper', '11111111-1111-1111-1111-111111111111', '_test_bams_product', 'year', '_test_bams_y1', 99, 'created', '_test_rzp_order_tamper')
on conflict (id) do update set scope = excluded.scope, year_id = excluded.year_id;
-- order.scope is 'year' (tampered/broad) even though the product is chapter-scoped.
select scope, chapter_id, year_id from public.orders where id = '_test_order_tamper';
select public.grant_razorpay_payment('_test_evt_2', '_test_rzp_order_tamper', '_test_rzp_pay_tamper', 9900);
-- Expect: scope = 'chapter', chapter_id = '_test_bams_ch1', year_id = null —
-- i.e. exactly what the PRODUCT defines, not the tampered order.
select scope, chapter_id, year_id, course_id from public.purchases where order_id = '_test_order_tamper';

-- ============================================================================
-- CLEANUP
-- ============================================================================
delete from public.referrals where referrer_id in (
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'
);
delete from public.purchases where order_id like '\_test\_%';
delete from public.orders where id like '\_test\_%';
delete from public.products where id like '\_test\_%';
delete from public.notes where id like '\_test\_%';
delete from public.chapters where id like '\_test\_%';
delete from public.subjects where id like '\_test\_%';
delete from public.years where id like '\_test\_%';
delete from public.courses where id like '\_test\_%';
update public.profiles set course_id = null, year_id = null
  where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
update public.referral_settings set enabled = false where id = true;
