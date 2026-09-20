-- ============================================================================
-- Step 1 of 2 for the legacy-data backfill check.
-- Run this on a LOCAL/STAGING database BEFORE applying
-- 20260919120000_multi_course_and_referrals.sql, then apply the migrations,
-- then run legacy_backfill_verify.sql. It uses only pre-migration columns and
-- imitates a BAMS-only production database: 1 year hierarchy, one product per
-- scope (chapter/subject/year/bundle), paid orders/purchases, and students.
-- Fixture matches the LIVE schema (chapters.year_id / videos.year_id are NOT
-- NULL there) and creates the 'notes' bucket the storage rows reference.
-- ============================================================================
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-4111-8111-111111111111', 'legacy.ch@example.test', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'legacy.subj@example.test', 'authenticated', 'authenticated'),
  ('33333333-3333-4333-8333-333333333333', 'legacy.year@example.test', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-8444-444444444444', 'legacy.bundle@example.test', 'authenticated', 'authenticated'),
  ('55555555-5555-4555-8555-555555555555', 'legacy.none@example.test', 'authenticated', 'authenticated');

insert into public.years (id, title) values ('y1', '1st Year'), ('y2', '2nd Year');
insert into public.subjects (id, title, year_id) values ('s1', 'Anatomy', 'y1'), ('s2', 'Physiology', 'y1'), ('s3', 'Pathology', 'y2');
insert into public.chapters (id, title, subject_id, year_id) values
  ('c1', 'Ch 1', 's1', 'y1'), ('c2', 'Ch 2', 's1', 'y1'), ('c3', 'Ch 3', 's2', 'y1'), ('c4', 'Ch 4', 's3', 'y2');
insert into public.notes (id, title, pdf_url, chapter_id) values
  ('n1', 'N1', 'https://x/storage/v1/object/public/notes/n1.pdf', 'c1'),
  ('n2', 'N2', 'https://x/storage/v1/object/public/notes/n2.pdf', 'c2'),
  ('n3', 'N3', 'https://x/storage/v1/object/public/notes/n3.pdf', 'c3'),
  ('n4', 'N4', 'https://x/storage/v1/object/public/notes/n4.pdf', 'c4');
insert into public.videos (id, title, youtube_url, subject_id, year_id) values ('v1', 'V1', 'u', 's1', 'y1');
insert into public.quiz_tests (id, title, subject_id, year_id) values ('q1', 'Q1', 's1', 'y1');
insert into public.products (id, title, scope, price, chapter_id, subject_id, year_id, year_ids) values
  ('p-ch',  'Chapter pack', 'chapter', 50,  'c1', null, null, null),
  ('p-sub', 'Subject pack', 'subject', 150, null, 's1', null, null),
  ('p-yr',  'Year pack',    'year',    500, null, null, 'y1', null),
  ('p-bun', 'Bundle',       'bundle',  900, null, null, null, array['y1','y2']);

insert into public.orders (id, user_id, product_id, scope, chapter_id, subject_id, year_id, year_ids, amount, status, razorpay_order_id) values
  ('o1', '11111111-1111-4111-8111-111111111111', 'p-ch',  'chapter', 'c1', null, null, null, 50,  'paid', 'r1'),
  ('o2', '22222222-2222-4222-8222-222222222222', 'p-sub', 'subject', null, 's1', null, null, 150, 'paid', 'r2'),
  ('o3', '33333333-3333-4333-8333-333333333333', 'p-yr',  'year',    null, null, 'y1', null, 500, 'paid', 'r3'),
  ('o4', '44444444-4444-4444-8444-444444444444', 'p-bun', 'bundle',  null, null, null, array['y1','y2'], 900, 'paid', 'r4'),
  ('o5', '55555555-5555-4555-8555-555555555555', 'p-ch',  'chapter', 'c1', null, null, null, 50, 'created', null);

insert into public.purchases (id, user_id, order_id, product_id, scope, chapter_id, subject_id, year_id, year_ids, amount, status) values
  ('pu1', '11111111-1111-4111-8111-111111111111', 'o1', 'p-ch',  'chapter', 'c1', null, null, null, 50,  'success'),
  ('pu2', '22222222-2222-4222-8222-222222222222', 'o2', 'p-sub', 'subject', null, 's1', null, null, 150, 'success'),
  ('pu3', '33333333-3333-4333-8333-333333333333', 'o3', 'p-yr',  'year',    null, null, 'y1', null, 500, 'success'),
  ('pu4', '44444444-4444-4444-8444-444444444444', 'o4', 'p-bun', 'bundle',  null, null, null, array['y1','y2'], 900, 'success');
-- (a purchase row with no product_id, as older purchases may have)
insert into public.purchases (id, user_id, order_id, scope, year_id, amount, status)
  values ('pu5', '33333333-3333-4333-8333-333333333333', null, 'year', 'y2', 500, 'success');

insert into storage.buckets (id, name) values ('notes', 'notes') on conflict do nothing;
insert into storage.objects (bucket_id, name) values
  ('notes','n1.pdf'),('notes','n2.pdf'),('notes','n3.pdf'),('notes','n4.pdf');
