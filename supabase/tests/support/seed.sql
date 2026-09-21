-- Minimal catalogue + one buyer, for the suites that need "a student who bought a note"
-- (high_phone_and_notes_checks, medium_db_checks). Idempotent.
insert into public.years (id, title, course_id) values ('seed_y', 'Seed year', 'bams') on conflict do nothing;
insert into public.subjects (id, title, year_id) values ('seed_s', 'Seed subject', 'seed_y') on conflict do nothing;
insert into public.chapters (id, title, subject_id) values ('seed_c', 'Seed chapter', 'seed_s') on conflict do nothing;
insert into public.notes (id, title, pdf_url, chapter_id)
  values ('seed_note', 'Seed note', 'https://example.supabase.co/storage/v1/object/public/notes/seed-note.pdf', 'seed_c') on conflict do nothing;
insert into auth.users (id, email) values ('5eed0000-0000-0000-0000-00000000000b', 'seed-buyer@example.com') on conflict do nothing;
insert into public.purchases (id, user_id, scope, status, chapter_id, course_id)
  select 'seed_purchase', '5eed0000-0000-0000-0000-00000000000b', 'chapter', 'success', 'seed_c', c.course_id
  from public.chapters c where c.id = 'seed_c' on conflict do nothing;
insert into public.products (id, title, scope, price, active, chapter_id, course_id, product_type)
  values ('seed_product', 'Seed product', 'chapter', 49, true, 'seed_c', 'bams', 'notes') on conflict do nothing;
