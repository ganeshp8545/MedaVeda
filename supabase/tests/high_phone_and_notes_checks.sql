-- HIGH fixes: phone change guard + change_my_phone(), notes storage policy (exact path).
-- Runs in one rolled-back transaction. Prints "N FAIL, M PASS".
begin;
create temp table res(name text, ok boolean);
grant all on res to public;

-- helpers: run sql as a given user (role authenticated + jwt sub), capture error/no error
create or replace function pg_temp.as_user(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare err text;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql; err := null;
  exception when others then err := sqlstate || ':' || sqlerrm; end;
  reset role;
  return err;
end $$;
create or replace function pg_temp.rpc_as(p_uid uuid, p_phone text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
  select public.change_my_phone(p_phone) into r;
  reset role;
  return r;
end $$;
create or replace function pg_temp.check(n text, ok boolean) returns void language sql as $$ insert into res values (n, coalesce(ok,false)) $$;

-- two plain students (not admins, not blocked) with distinct phones
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','ta@example.com'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','tb@example.com') on conflict do nothing;
insert into public.profiles (id, name, email, phone) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','A','ta@example.com','+919000000001'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','B','tb@example.com','+919000000002')
on conflict (id) do update set phone = excluded.phone, phone_normalized = public.normalize_phone(excluded.phone);

do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
  b constant uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
  e text; r jsonb; i int;
begin
  -- 1-2: direct phone updates are refused, with the SAME error for free and taken numbers
  e := pg_temp.as_user(a, $q$update public.profiles set phone='+919111111111' where id='aaaaaaaa-0000-0000-0000-00000000000a'$q$);
  perform pg_temp.check('direct update to a free number is refused (42501)', e like '42501:%');
  e := pg_temp.as_user(a, $q$update public.profiles set phone='+919000000002' where id='aaaaaaaa-0000-0000-0000-00000000000a'$q$);
  perform pg_temp.check('direct update to a TAKEN number gives the same 42501, not a unique violation', e like '42501:%' and e not like '%unique%');
  -- 3: saving with the phone unchanged (what the released app does) still works
  e := pg_temp.as_user(a, $q$update public.profiles set name='A2', phone='+919000000001' where id='aaaaaaaa-0000-0000-0000-00000000000a'$q$);
  perform pg_temp.check('profile save with unchanged phone still works', e is null);
  -- 4: other protected columns still protected
  e := pg_temp.as_user(a, $q$update public.profiles set blocked=false, mobile_verified=true where id='aaaaaaaa-0000-0000-0000-00000000000a'$q$);
  perform pg_temp.check('mobile_verified still protected', e like '42501:%');

  -- 5: RPC: free number works, unverified afterwards
  r := pg_temp.rpc_as(a, '+91 98765-43210');
  perform pg_temp.check('change_my_phone to a free number ok', r = '{"ok": true}');
  perform pg_temp.check('phone stored normalised, mobile_verified=false',
    (select phone = '+919876543210' and phone_normalized = '+919876543210' and mobile_verified = false from public.profiles where id = a));
  -- 6: taken number: generic answer, nothing changed
  r := pg_temp.rpc_as(a, '+919000000002');
  perform pg_temp.check('taken number -> unavailable (no leak)', r = '{"ok": false, "code": "unavailable"}');
  perform pg_temp.check('taken number left phone untouched', (select phone = '+919876543210' from public.profiles where id = a));
  -- 7: invalid
  r := pg_temp.rpc_as(a, 'abc');
  perform pg_temp.check('invalid number -> invalid', r = '{"ok": false, "code": "invalid"}');
  -- 8: bypass flag was reset: course_id still protected in the same transaction
  e := pg_temp.as_user(a, $q$update public.profiles set course_id='x' where id='aaaaaaaa-0000-0000-0000-00000000000a'$q$);
  perform pg_temp.check('bypass flag not left on after the RPC', e like '42501:%');
  -- 9: rate limit: 3 calls so far (5 -> 2 more allowed, then refused)
  r := pg_temp.rpc_as(a, '+919222222222'); r := pg_temp.rpc_as(a, '+919222222223');
  r := pg_temp.rpc_as(a, '+919222222224');
  perform pg_temp.check('6th call in 24h -> rate_limited', r = '{"ok": false, "code": "rate_limited"}');
  -- 10: user B unaffected by A's limit; clearing allowed
  r := pg_temp.rpc_as(b, null);
  perform pg_temp.check('other user not rate limited; clearing the number works',
    r = '{"ok": true}' and (select phone is null from public.profiles where id = b));
  -- 11: anon cannot call it
  perform pg_temp.check('anon has no EXECUTE on change_my_phone', not has_function_privilege('anon','public.change_my_phone(text)','execute'));
  perform pg_temp.check('authenticated has EXECUTE', has_function_privilege('authenticated','public.change_my_phone(text)','execute'));
  -- 12: unauthenticated call fails
  begin
    set local role anon; perform public.change_my_phone('+919333333333'); reset role;
    perform pg_temp.check('anon call refused', false);
  exception when others then reset role; perform pg_temp.check('anon call refused', true);
  end;
end $$;

-- ---- storage policy ------------------------------------------------------------
-- (hosted Supabase already grants these; a plain local restore does not)
grant usage on schema storage to anon, authenticated;
grant select on storage.objects to anon, authenticated;
do $$
declare
  v_note record; v_buyer uuid; v_other uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
  v_name text; v_seen int;
begin
  select n.id, n.chapter_id, n.pdf_url into v_note
  from public.notes n join public.chapters c on c.id = n.chapter_id
  where n.active and exists (select 1 from public.purchases p where p.status='success' and p.user_id is not null and not exists (select 1 from public.admins ad where ad.id = p.user_id) and p.course_id=c.course_id and (
     (p.scope='chapter' and p.chapter_id=c.id) or (p.scope='subject' and p.subject_id=c.subject_id)
     or (p.scope='year' and p.year_id=c.year_id) or (p.scope='bundle' and c.year_id = any(p.year_ids))))
  limit 1;
  if v_note.id is null then perform pg_temp.check('storage: found a bought note in data', false); return; end if;
  select p.user_id into v_buyer from public.purchases p join public.chapters c on c.id=v_note.chapter_id
   where p.status='success' and p.user_id is not null and not exists (select 1 from public.admins ad where ad.id = p.user_id) and p.course_id=c.course_id and (
     (p.scope='chapter' and p.chapter_id=c.id) or (p.scope='subject' and p.subject_id=c.subject_id)
     or (p.scope='year' and p.year_id=c.year_id) or (p.scope='bundle' and c.year_id = any(p.year_ids))) limit 1;
  v_name := regexp_replace(v_note.pdf_url, '^.*/object/public/notes/', '');
  insert into storage.objects (bucket_id, name) values ('notes', v_name) on conflict do nothing;
  insert into storage.objects (bucket_id, name) values ('notes', right(v_name, 8)) on conflict do nothing;   -- a SUBSTRING of the real path
  insert into storage.objects (bucket_id, name) values ('notes', 'zz-decoy.pdf') on conflict do nothing;

  perform set_config('request.jwt.claim.sub', v_buyer::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_buyer, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_seen from storage.objects where bucket_id='notes' and name = v_name;
  perform pg_temp.check('buyer can read the exact object', v_seen = 1);
  select count(*) into v_seen from storage.objects where bucket_id='notes' and name = right(v_name, 8);
  perform pg_temp.check('buyer can NOT read an object whose name is only a substring of the path', v_seen = 0);
  select count(*) into v_seen from storage.objects where bucket_id='notes' and name = 'zz-decoy.pdf';
  perform pg_temp.check('buyer can not read an unrelated object', v_seen = 0);
  reset role;

  perform set_config('request.jwt.claim.sub', v_other::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_seen from storage.objects where bucket_id='notes' and name = v_name;
  perform pg_temp.check('non-buyer can not read the object', v_seen = 0);
  reset role;
  set local role anon;
  select count(*) into v_seen from storage.objects where bucket_id='notes' and name = v_name;
  perform pg_temp.check('anon can not read the object', v_seen = 0);
  reset role;
  perform pg_temp.check('notes bucket is private', (select not public from storage.buckets where id='notes'));
end $$;

select format('%s: %s', case when ok then 'PASS' else 'FAIL' end, name) from res order by ok, name;
select (select count(*) from res where not ok) || ' FAIL, ' || (select count(*) from res where ok) || ' PASS';
rollback;
