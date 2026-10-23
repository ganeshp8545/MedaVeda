-- Run only against a disposable database; every fixture is rolled back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_ok(ok boolean, label text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.as_student() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims','{"sub":"c0a00000-0000-0000-0000-000000000001","role":"authenticated"}',true);
  perform set_config('role','authenticated',true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin perform set_config('role','postgres',true); end $$;
insert into auth.users(id,email) values ('c0a00000-0000-0000-0000-000000000001','browse@example.test');
insert into public.courses(id,name,code) values ('browse_course','Browse','BROWSE'),('browse_other','Other','OTHER');
insert into public.years(id,title,course_id)
select 'browse_y'||i, 'Year '||i, 'browse_course' from generate_series(1,4) i;
insert into public.years(id,title,course_id) values ('browse_y5','Other year','browse_other');
insert into public.subjects(id,title,year_id) select 'browse_s'||i,'Subject '||i,'browse_y'||i from generate_series(1,5) i;
insert into public.chapters(id,title,subject_id) select 'browse_c'||i,'Chapter '||i,'browse_s'||i from generate_series(1,5) i;
insert into public.notes(id,title,chapter_id,pdf_url) select 'browse_n'||i,'Note '||i,'browse_c'||i,'https://example.test/notes/browse_n'||i||'.pdf' from generate_series(1,5) i;
insert into public.videos(id,title,subject_id,youtube_url) select 'browse_v'||i,'Video '||i,'browse_s'||i,'https://youtu.be/example' from generate_series(1,5) i;
insert into public.quiz_tests(id,title,subject_id,questions)
select 'browse_q'||i,'Quiz '||i,'browse_s'||i,'[{"options":["yes","no"],"answer":"yes"}]'::jsonb from generate_series(1,5) i;
insert into public.products(id,title,scope,year_id,price) select 'browse_p'||i,'Pack '||i,'year','browse_y'||i,49 from generate_series(1,5) i;
insert into storage.objects(bucket_id,name) select 'notes','browse_n'||i||'.pdf' from generate_series(1,5) i;

-- Existing student, every registered year -> all four browsing years.
do $$ declare registered int; tbl text; n int; actual_year text;
begin
 for registered in 1..4 loop
  perform set_config('app.allow_profile_admin_fields','true',true);
  update public.profiles set course_id='browse_course',year_id='browse_y'||registered where id='c0a00000-0000-0000-0000-000000000001';
  perform set_config('app.allow_profile_admin_fields','false',true);
  perform pg_temp.as_student();
  foreach tbl in array array['subjects','chapters','notes','videos','quiz_tests','products'] loop
   execute format('select count(*) from public.%I where id like ''browse_%%''',tbl) into n;
   perform pg_temp.assert_ok(n=4,format('registration year %s: %s catalogue includes exactly four own-course rows (got %s)',registered,tbl,n));
  end loop;
  perform pg_temp.assert_ok(not public.has_content_access('browse_other','browse_y5'),'cross-course helper denied');
  select year_id into actual_year from public.profiles where id=auth.uid();
  perform pg_temp.assert_ok(actual_year='browse_y'||registered,'browsing leaves profile year unchanged');
  perform pg_temp.assert_ok(not public.user_owns_chapter('browse_c2'),'browsing grants no entitlement');
  perform pg_temp.assert_ok((select count(*)=0 from storage.objects where name like 'browse_%'),'direct PDF storage remains denied');
  perform pg_temp.assert_ok(public.submit_quiz_attempt('browse_attempt_'||registered,'browse_q2',1,'[0]'::jsonb)->>'score'='1','other-year quiz loads and scores');
  begin
   perform public.submit_quiz_attempt('browse_cross_'||registered,'browse_q5',1,'[0]'::jsonb);
   raise exception 'FAIL: cross-course quiz accepted';
  exception when invalid_parameter_value then null; end;
  begin
   insert into public.subjects(id,title,year_id) values ('browse_forged','Forged','browse_y1');
   raise exception 'FAIL: unauthorized subject insert';
  exception when insufficient_privilege then null; end;
  begin
   update public.profiles set year_id='browse_y1' where id=auth.uid();
   if registered<>1 then raise exception 'FAIL: direct profile year write'; end if;
  exception when insufficient_privilege then null; when raise_exception then
   if sqlerrm <> 'Cannot modify protected profile fields directly; use set_my_course_year() or contact support.' then raise; end if;
  end;
  perform pg_temp.as_owner();
 end loop;
end $$;

-- Service-only URL decisions use explicit user identity, not service auth.uid().
do $$ declare i int;
begin
 for i in 1..4 loop
  perform pg_temp.assert_ok(public.user_can_access_video('c0a00000-0000-0000-0000-000000000001','browse_v'||i),'free videos across all years');
  perform pg_temp.assert_ok(not public.user_can_access_note('c0a00000-0000-0000-0000-000000000001','browse_n'||i),'paid notes locked across all years');
 end loop;
 perform pg_temp.assert_ok(not public.user_can_access_video('c0a00000-0000-0000-0000-000000000001','browse_v5'),'cross-course video deep link denied');
end $$;
update public.notes set is_free_preview=true where id in ('browse_n2','browse_n5');
select pg_temp.assert_ok(public.user_can_access_note('c0a00000-0000-0000-0000-000000000001','browse_n2'),'own-course preview free across years');
select pg_temp.assert_ok(not public.user_can_access_note('c0a00000-0000-0000-0000-000000000001','browse_n5'),'cross-course free preview denied');
update public.notes set is_free_preview=false where id='browse_n2';

-- Same-year siblings catch accidental chapter -> subject/year scope expansion.
insert into public.subjects(id,title,year_id) values ('sibling_subject','Sibling subject','browse_y2');
insert into public.chapters(id,title,subject_id) values
  ('sibling_chapter','Same subject','browse_s2'),('sibling_other_chapter','Other subject','sibling_subject');
insert into public.notes(id,title,chapter_id,pdf_url) values
  ('sibling_note','Same subject note','sibling_chapter','https://example.test/sibling.pdf'),
  ('sibling_other_note','Other subject note','sibling_other_chapter','https://example.test/other.pdf');

-- Each original purchase scope unlocks exactly its original years/chapters.
do $$ declare purchase_scope text; i int;
begin
 foreach purchase_scope in array array['chapter','subject','year','bundle'] loop
  insert into public.purchases(id,user_id,scope,status,course_id,chapter_id,subject_id,year_id,year_ids)
  values ('browse_purchase','c0a00000-0000-0000-0000-000000000001',purchase_scope,'success','browse_course',
    case when purchase_scope='chapter' then 'browse_c2' end,
    case when purchase_scope='subject' then 'browse_s2' end,
    case when purchase_scope='year' then 'browse_y2' end,
    case when purchase_scope='bundle' then array['browse_y2','browse_y3'] end);
  for i in 1..4 loop
   perform pg_temp.assert_ok(public.user_can_access_note('c0a00000-0000-0000-0000-000000000001','browse_n'||i)
     = (i=2 or (purchase_scope='bundle' and i=3)),purchase_scope||' retains original scope');
  end loop;
  perform pg_temp.assert_ok(public.user_can_access_note('c0a00000-0000-0000-0000-000000000001','sibling_note')
    = (purchase_scope in ('subject','year','bundle')),purchase_scope||' same-subject sibling scope');
  perform pg_temp.assert_ok(public.user_can_access_note('c0a00000-0000-0000-0000-000000000001','sibling_other_note')
    = (purchase_scope in ('year','bundle')),purchase_scope||' other-subject sibling scope');
  -- A later course/profile change must not erase an existing purchase.
  perform set_config('app.allow_profile_admin_fields','true',true);
  update public.profiles set course_id='browse_other',year_id='browse_y5' where id='c0a00000-0000-0000-0000-000000000001';
  perform set_config('app.allow_profile_admin_fields','false',true);
  perform pg_temp.as_student();
  perform pg_temp.assert_ok(public.has_content_access('browse_course','browse_y2'),'prior-course purchase visibility retained');
  perform pg_temp.assert_ok(not public.has_content_access('browse_course','browse_y1'),'prior-course purchase cannot expand to unpaid years');
  perform pg_temp.as_owner();
  perform pg_temp.assert_ok(public.user_can_access_note('c0a00000-0000-0000-0000-000000000001','browse_n2'),'prior-course paid entitlement retained');
  perform pg_temp.assert_ok(public.user_can_access_video('c0a00000-0000-0000-0000-000000000001','browse_v2'),'prior-course purchased year retains free video access');
  perform set_config('app.allow_profile_admin_fields','true',true);
  update public.profiles set course_id='browse_course',year_id='browse_y4' where id='c0a00000-0000-0000-0000-000000000001';
  perform set_config('app.allow_profile_admin_fields','false',true);
  update public.purchases set status='refunded' where id='browse_purchase';
  perform pg_temp.assert_ok(not public.user_can_access_note('c0a00000-0000-0000-0000-000000000001','browse_n2'),'refund still locks notes');
  delete from public.purchases where id='browse_purchase';
 end loop;
end $$;

-- Unpublished catalogue rows stay hidden even in another browsing year.
update public.subjects set active=false where id='browse_s3';
update public.chapters set active=false where id='browse_c3';
update public.notes set active=false where id='browse_n3';
update public.videos set active=false where id='browse_v3';
update public.quiz_tests set active=false where id='browse_q3';
update public.products set active=false where id='browse_p3';
do $$ declare tbl text; n int;
begin
 perform pg_temp.as_student();
 foreach tbl in array array['subjects','chapters','notes','videos','quiz_tests','products'] loop
  execute format('select count(*) from public.%I where id like ''browse_%%''',tbl) into n;
  perform pg_temp.assert_ok(n=3,tbl||' inactive content hidden');
 end loop;
 perform pg_temp.as_owner();
 perform pg_temp.assert_ok(not public.user_can_access_video('c0a00000-0000-0000-0000-000000000001','browse_v3'),'inactive video denied');
 perform pg_temp.assert_ok(not has_function_privilege('anon','public.has_content_access(text,text)','execute'),'anonymous helper denied');
 perform pg_temp.assert_ok(not has_function_privilege('authenticated','public.user_can_access_note(uuid,text)','execute'),'note helper service-only');
 perform pg_temp.assert_ok(not has_function_privilege('authenticated','public.user_can_access_video(uuid,text)','execute'),'video helper service-only');
end $$;
update public.profiles set blocked=true where id='c0a00000-0000-0000-0000-000000000001';
select pg_temp.assert_ok(not public.user_can_access_video('c0a00000-0000-0000-0000-000000000001','browse_v1'),'blocked video denied');
select pg_temp.assert_ok(not public.user_can_access_note('c0a00000-0000-0000-0000-000000000001','browse_n2'),'blocked note denied');
rollback;
\echo 'PASS course_wide_browsing_checks: four registration years, catalogue RLS, course isolation, quizzes, free videos, previews, four purchase scopes, refunds, inactive content, profile and write protection'
