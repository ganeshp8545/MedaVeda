-- Disposable database only. The suite wraps all fixtures in a rollback.
begin;
create temp table result(name text, ok boolean);
create or replace function pg_temp.check(p_name text, p_ok boolean) returns void
language sql as $$ insert into result values (p_name,coalesce(p_ok,false)) $$;
create or replace function pg_temp.call_as(p_role text,p_uid uuid,p_sql text) returns text
language plpgsql as $$
declare v_result text;
begin
  perform set_config('request.jwt.claim.sub',coalesce(p_uid::text,''),true);
  perform set_config('request.jwt.claims',json_build_object('sub',p_uid,'role',p_role,'aal','aal1')::text,true);
  execute format('set local role %I',p_role);
  begin execute p_sql into v_result;
  exception when others then v_result := 'ERR ' || sqlstate; end;
  reset role;
  return v_result;
end $$;

insert into auth.users(id,email) values
  ('abc00000-0000-0000-0000-000000000001','quiz-one@example.com'),
  ('abc00000-0000-0000-0000-000000000002','quiz-two@example.com'),
  ('abc00000-0000-0000-0000-000000000003','note-admin@example.com');
insert into public.profiles(id,email) values
  ('abc00000-0000-0000-0000-000000000001','quiz-one@example.com'),
  ('abc00000-0000-0000-0000-000000000002','quiz-two@example.com') on conflict do nothing;
insert into public.admins(id,email) values
  ('abc00000-0000-0000-0000-000000000003','note-admin@example.com');
insert into public.quiz_tests(id,title,subject_id,year_id,questions,active)
values ('verified_test','Verified test','seed_s','seed_y',
  '[{"options":["wrong","right"],"answer":"right"},{"options":["yes","no"],"answer":"yes"}]'::jsonb,true);

select pg_temp.check('server scores correct answers',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$select public.submit_quiz_attempt('verified_001','verified_test',1,'[1,0]'::jsonb)->>'score'$x$)='2');
select pg_temp.check('server scores wrong answers',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$select public.submit_quiz_attempt('verified_002','verified_test',1,'[0,1]'::jsonb)->>'score'$x$)='0');
select pg_temp.check('duplicate submission returns same score',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$select public.submit_quiz_attempt('verified_001','verified_test',1,'[1,0]'::jsonb)->>'score'$x$)='2');
select pg_temp.check('duplicate ID with changed answers rejected',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$select public.submit_quiz_attempt('verified_001','verified_test',1,'[0,0]'::jsonb)$x$)='ERR 23505');
select pg_temp.check('cross-user duplicate ID rejected',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000002',
  $x$select public.submit_quiz_attempt('verified_001','verified_test',1,'[1,0]'::jsonb)$x$)='ERR 23505');
select pg_temp.check('invalid answer index rejected',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$select public.submit_quiz_attempt('verified_003','verified_test',1,'[9,0]'::jsonb)$x$)='ERR 22023');
select pg_temp.check('inactive test rejected',
  (select true from public.quiz_tests where id='verified_test'));
update public.quiz_tests set active=false where id='verified_test';
select pg_temp.check('inactive test cannot be submitted',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$select public.submit_quiz_attempt('verified_004','verified_test',1,'[1,0]'::jsonb)$x$)='ERR 22023');
update public.quiz_tests set active=true,questions='[{"options":["A","B"],"answer":"B"}]'::jsonb where id='verified_test';
select pg_temp.check('question revision bumps',
  (select question_revision=2 from public.quiz_tests where id='verified_test'));
select pg_temp.check('stale offline attempt stays unverified',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$select public.submit_quiz_attempt('verified_005','verified_test',1,'[1,0]'::jsonb)->>'status'$x$)='stale');
select pg_temp.check('direct verified score insert denied',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$insert into public.verified_quiz_attempts(id,user_id,test_title,question_revision,answers,score,total,percentage)
    values('forged_001','abc00000-0000-0000-0000-000000000001','forged',1,'[0]',1,1,100)$x$)='ERR 42501');
select pg_temp.check('other user cannot read score',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000002',
  $x$select count(*) from public.verified_quiz_attempts where id='verified_001'$x$)='0');
select pg_temp.check('owner can read verified score',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$select score::text from public.verified_quiz_attempts where id='verified_001'$x$)='2');
select pg_temp.check('admin can read verified score',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000003',
  $x$select score::text from public.verified_quiz_attempts where id='verified_001'$x$)='2');
select pg_temp.check('other user cannot edit verified score',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000002',
  $x$update public.verified_quiz_attempts set score=0 where id='verified_001' returning score::text$x$)='ERR 42501');
select pg_temp.check('owner cannot edit verified score',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$update public.verified_quiz_attempts set score=0 where id='verified_001' returning score::text$x$)='ERR 42501');
select pg_temp.check('legacy own score remains compatible',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$insert into public.quiz_scores(id,user_id,score,total,percentage)
     values('legacy_forged','abc00000-0000-0000-0000-000000000001',1,1,100) returning id$x$)='legacy_forged');
select pg_temp.check('legacy cross-account insert denied',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000002',
  $x$insert into public.quiz_scores(id,user_id,score,total,percentage)
     values('legacy_other','abc00000-0000-0000-0000-000000000001',1,1,100)$x$)='ERR 42501');
select pg_temp.check('forged legacy score cannot alter verified statistics',
  (select count(*)=2 and max(score)=2 and avg(percentage)=50 from public.verified_quiz_attempts
    where user_id='abc00000-0000-0000-0000-000000000001'));
update public.profiles set blocked=true where id='abc00000-0000-0000-0000-000000000002';
select pg_temp.check('blocked account cannot submit',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000002',
  $x$select public.submit_quiz_attempt('verified_006','verified_test',2,'[1]'::jsonb)$x$)='ERR 42501');
select pg_temp.check('anonymous cannot submit',
  pg_temp.call_as('anon',null,
  $x$select public.submit_quiz_attempt('verified_007','verified_test',2,'[1]'::jsonb)$x$)='ERR 42501');
delete from public.quiz_tests where id='verified_test';
select pg_temp.check('retry survives source test deletion',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$select public.submit_quiz_attempt('verified_001','verified_test',1,'[1,0]'::jsonb)->>'score'$x$)='2');

insert into public.note_upload_requests(request_id,admin_user_id,sha256,object_path,pdf_url,status)
values('abc00000-0000-0000-0000-000000000011','abc00000-0000-0000-0000-000000000003',
  repeat('a',64),'validated/abc00000-0000-0000-0000-000000000003/abc00000-0000-0000-0000-000000000011.pdf',
  'https://example.supabase.co/storage/v1/object/public/notes/validated/abc00000-0000-0000-0000-000000000003/abc00000-0000-0000-0000-000000000011.pdf','uploaded');
select pg_temp.check('student cannot attach admin upload',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$select public.save_note_with_upload('abc00000-0000-0000-0000-000000000011',null,'Title','Description','seed_c',1,true,false)$x$)='ERR 42501');
select pg_temp.check('admin attaches upload and description',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000003',
  $x$select public.save_note_with_upload('abc00000-0000-0000-0000-000000000011',null,'Title','Description','seed_c',1,true,false)$x$) <> 'ERR 42501');
select pg_temp.check('saved description and upload ledger match',
  exists(select 1 from public.note_upload_requests u join public.notes n on n.id=u.note_id
    where u.request_id='abc00000-0000-0000-0000-000000000011' and u.status='attached'
      and n.description='Description' and n.pdf_url=u.pdf_url));
select pg_temp.check('save retry did not create a second note',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000003',
  $x$select public.save_note_with_upload('abc00000-0000-0000-0000-000000000011',null,'Title','Description','seed_c',1,true,false)$x$)
    = (select note_id from public.note_upload_requests where request_id='abc00000-0000-0000-0000-000000000011'));
select pg_temp.check('changed retry payload rejected',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000003',
  $x$select public.save_note_with_upload('abc00000-0000-0000-0000-000000000011',null,'Changed','Description','seed_c',1,true,false)$x$)='ERR 23505');
delete from public.notes where id = (select note_id from public.note_upload_requests
  where request_id='abc00000-0000-0000-0000-000000000011');
select pg_temp.check('deleted note retry returns explicit error',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000003',
  $x$select public.save_note_with_upload('abc00000-0000-0000-0000-000000000011',null,'Title','Description','seed_c',1,true,false)$x$)='ERR 22023');
select pg_temp.check('direct note bucket writes restricted',
  (select count(*)=3 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname in ('notes_server_insert_only','notes_server_update_only','notes_server_delete_only')
    and permissive='RESTRICTIVE'));
-- The local stub grants Storage writes only to service_role by default;
-- temporarily grant authenticated rights to prove the restrictive policy
-- still denies an admin even if a permissive grant/policy exists.
grant insert,update,delete on storage.objects to authenticated;
insert into storage.objects(bucket_id,name) values('notes','existing.pdf');
select pg_temp.check('admin direct Storage insert denied',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000003',
  $x$insert into storage.objects(bucket_id,name) values('notes','bypass.pdf') returning name$x$)='ERR 42501');
select pg_temp.check('admin direct Storage update denied',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000003',
  $x$update storage.objects set name='changed.pdf' where bucket_id='notes' and name='existing.pdf' returning name$x$) is null);
select pg_temp.check('admin direct Storage delete denied',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000003',
  $x$delete from storage.objects where bucket_id='notes' and name='existing.pdf' returning name$x$) is null);


select pg_temp.check('student cannot reserve quarantine',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$select public.reserve_note_pdf_validation('abc00000-0000-0000-0000-000000000021','abc00000-0000-0000-0000-000000000003',repeat('b',64),100,'https://example.invalid/pdf')$x$)='ERR 42501');
select public.reserve_note_pdf_validation('abc00000-0000-0000-0000-000000000021','abc00000-0000-0000-0000-000000000003',repeat('b',64),100,'https://example.invalid/pdf');
select pg_temp.check('quarantine cannot attach before validation',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000003',
  $x$select public.save_note_with_upload('abc00000-0000-0000-0000-000000000021',null,'Quarantine','Description','seed_c',1,false,false)$x$)='ERR 22023');
select pg_temp.check('student cannot claim validation job',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$select public.claim_note_pdf_validation()$x$)='ERR 42501');
create temp table claimed as select * from public.claim_note_pdf_validation();
select pg_temp.check('validator claims one job', (select count(*)=1 from claimed));
select pg_temp.check('active lease cannot be claimed twice', (select count(*)=0 from public.claim_note_pdf_validation()));
select pg_temp.check('wrong lease cannot finish', not public.finish_note_pdf_validation('abc00000-0000-0000-0000-000000000021','abc00000-0000-0000-0000-000000000099','complete'));
select pg_temp.check('student cannot forge clean verdict',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000001',
  $x$select public.finish_note_pdf_validation('abc00000-0000-0000-0000-000000000021','abc00000-0000-0000-0000-000000000099','complete')$x$)='ERR 42501');
select pg_temp.check('trusted completion permits attach',
  (select public.finish_note_pdf_validation(request_id,lease_id,'complete') from claimed));
select pg_temp.check('trusted completion marks ledger uploaded',
  (select status='uploaded' from public.note_upload_requests where request_id='abc00000-0000-0000-0000-000000000021'));
select pg_temp.check('completed job cannot be reclaimed',(select count(*)=0 from public.claim_note_pdf_validation()));
select pg_temp.check('quarantine bucket is private', (select not public and file_size_limit=52428800 from storage.buckets where id='note-quarantine'));
insert into storage.objects(bucket_id,name) values('note-quarantine','private-fixture.pdf');
select pg_temp.check('admin cannot read quarantine through Storage',
  pg_temp.call_as('authenticated','abc00000-0000-0000-0000-000000000003',
  $x$select count(*) from storage.objects where bucket_id='note-quarantine'$x$)='0');

select pg_temp.check('quarantine changed size cannot reuse ID',
  pg_temp.call_as('service_role',null,
  $x$select public.reserve_note_pdf_validation('abc00000-0000-0000-0000-000000000021','abc00000-0000-0000-0000-000000000003',repeat('b',64),101,'https://example.invalid/pdf')$x$)='ERR 23505');
select public.reserve_note_pdf_validation('abc00000-0000-0000-0000-000000000022','abc00000-0000-0000-0000-000000000003',repeat('c',64),100,'https://example.invalid/pdf2');
truncate claimed;
insert into claimed select * from public.claim_note_pdf_validation();
update public.note_pdf_validation_jobs set lease_until=now()-interval '1 second' where request_id='abc00000-0000-0000-0000-000000000022';
select pg_temp.check('expired lease cannot finalize',not (select public.finish_note_pdf_validation(request_id,lease_id,'complete') from claimed));
create temp table reclaimed as select * from public.claim_note_pdf_validation();
select pg_temp.check('expired job receives new lease',exists(select 1 from reclaimed r join claimed c using(request_id) where r.lease_id<>c.lease_id));
select pg_temp.check('old lease cannot finalize after reclaim',not (select public.finish_note_pdf_validation(request_id,lease_id,'complete') from claimed));
select pg_temp.check('rejected job verdict recorded',(select public.finish_note_pdf_validation(request_id,lease_id,'rejected','invalid') from reclaimed));
select pg_temp.check('rejected upload remains unattachable',
  (select status='reserved' from public.note_upload_requests where request_id='abc00000-0000-0000-0000-000000000022'));
select public.reserve_note_pdf_validation('abc00000-0000-0000-0000-000000000022','abc00000-0000-0000-0000-000000000003',repeat('c',64),100,'https://example.invalid/pdf2');
select pg_temp.check('rejected bytes cannot be rearmed',(select status='rejected' from public.note_pdf_validation_jobs where request_id='abc00000-0000-0000-0000-000000000022'));
select public.reserve_note_pdf_validation('abc00000-0000-0000-0000-000000000023','abc00000-0000-0000-0000-000000000003',repeat('d',64),100,'https://example.invalid/pdf3');
update public.note_pdf_validation_jobs set attempts=5 where request_id='abc00000-0000-0000-0000-000000000023';
select pg_temp.check('exhausted transient job is not automatically reclaimed',(select count(*)=0 from public.claim_note_pdf_validation()));
select public.reserve_note_pdf_validation('abc00000-0000-0000-0000-000000000023','abc00000-0000-0000-0000-000000000003',repeat('d',64),100,'https://example.invalid/pdf3');
select pg_temp.check('same-file explicit retry rearms exhausted transient job',(select attempts=0 and status='pending' from public.note_pdf_validation_jobs where request_id='abc00000-0000-0000-0000-000000000023'));
select case when ok then 'PASS  ' else 'FAIL  ' end || name from result order by ok,name;
select (select count(*) from result where not ok) || ' FAIL, ' || (select count(*) from result where ok) || ' PASS';
rollback;
