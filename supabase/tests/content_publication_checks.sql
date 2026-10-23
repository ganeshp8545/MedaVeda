-- Disposable database only; all fixture/profile/purchase changes roll back.
\set ON_ERROR_STOP on
begin;
create temp table publication_results(label text);
grant insert,select on publication_results to authenticated,service_role;
create function pg_temp.check_publication(ok boolean, label text) returns void language plpgsql as $$
begin
 if not coalesce(ok,false) then raise exception 'FAIL: %',label; end if;
 insert into publication_results values(label);
end $$;
create function pg_temp.publication_user(p_uid uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',json_build_object('sub',p_uid,'role','authenticated','aal','aal2')::text,true);
 perform set_config('role','authenticated',true);
end $$;
create function pg_temp.publication_owner() returns void language plpgsql as $$
begin perform set_config('role','postgres',true); perform set_config('request.jwt.claims','{}',true); end $$;
insert into auth.users(id,email) values
 ('cab00000-0000-0000-0000-000000000001','publication-student@example.test'),
 ('cab00000-0000-0000-0000-000000000002','publication-buyer@example.test'),
 ('cab00000-0000-0000-0000-000000000003','publication-admin@example.test');
insert into public.admins(id,email) values ('cab00000-0000-0000-0000-000000000003','publication-admin@example.test');
insert into public.courses(id,name,code) values ('publication_course','Publication course','PUB_C'),('publication_other','Other course','PUB_O');
insert into public.years(id,title,course_id)
 select 'pub_y'||i,'Year '||i,case when i=5 then 'publication_other' else 'publication_course' end from generate_series(1,5) i;
insert into public.subjects(id,title,year_id) select 'pub_s'||i,'Subject '||i,'pub_y'||i from generate_series(1,5) i;
insert into public.chapters(id,title,subject_id) select 'pub_c'||i,'Chapter '||i,'pub_s'||i from generate_series(1,5) i;
insert into public.notes(id,title,chapter_id,pdf_url) select 'pub_n'||i,'Paid note '||i,'pub_c'||i,'https://example.test/storage/v1/object/public/notes/pub_n'||i||'.pdf' from generate_series(1,5) i;
insert into public.notes(id,title,chapter_id,pdf_url,is_free_preview) values
 ('pub_preview','Preview','pub_c2','pub-preview.pdf',true),('pub_foreign_preview','Foreign preview','pub_c5','pub-foreign-preview.pdf',true);
insert into public.videos(id,title,subject_id,youtube_url) select 'pub_v'||i,'Video '||i,'pub_s'||i,'https://youtu.be/example' from generate_series(1,5) i;
insert into public.quiz_tests(id,title,subject_id,questions)
 select 'pub_q'||i,'Quiz '||i,'pub_s'||i,'[{"options":["yes","no"],"answer":"yes"}]'::jsonb from generate_series(1,5) i;
insert into public.products(id,title,scope,year_id,price) select 'pub_p'||i,'Year pack '||i,'year','pub_y'||i,49 from generate_series(1,5) i;
insert into public.products(id,title,scope,subject_id,chapter_id,year_ids,price) values
 ('pub_subject_product','Subject pack','subject','pub_s2',null,null,49),
 ('pub_chapter_product','Chapter pack','chapter',null,'pub_c2',null,49),
 ('pub_bundle_product','Bundle','bundle',null,null,array['pub_y2','pub_y3'],49);
insert into storage.objects(bucket_id,name) values ('notes','pub_n2.pdf'),('notes','pub-preview.pdf');
select set_config('app.allow_profile_admin_fields','true',true);
update public.profiles set course_id='publication_course',year_id='pub_y1'
 where id in ('cab00000-0000-0000-0000-000000000001','cab00000-0000-0000-0000-000000000002');
select set_config('app.allow_profile_admin_fields','false',true);

-- Every registered year still browses every ACTIVE year, with no profile write.
do $$ declare registered int; tbl text; n int;
begin
 for registered in 1..4 loop
  perform set_config('app.allow_profile_admin_fields','true',true);
  update public.profiles set year_id='pub_y'||registered where id='cab00000-0000-0000-0000-000000000001';
  perform set_config('app.allow_profile_admin_fields','false',true);
  perform pg_temp.publication_user('cab00000-0000-0000-0000-000000000001');
  foreach tbl in array array['subjects','chapters','notes','videos','quiz_tests'] loop
   execute format('select count(*) from public.%I where id ~ ''^pub_[scnvq][1-5]$''',tbl) into n;
   perform pg_temp.check_publication(n=4,format('registered year %s browses four active years of %s',registered,tbl));
  end loop;
  perform pg_temp.check_publication((select year_id='pub_y'||registered from public.profiles where id=auth.uid()),'profile year is unchanged');
  perform pg_temp.publication_owner();
 end loop;
end $$;

-- Deactivate ONE level at a time while descendants and purchases stay intact.
do $$
declare level text; purchase_scope text; who uuid; tbl text; n int; visible boolean;
 subject_ok boolean; chapter_ok boolean; note_ok boolean; video_ok boolean; quiz_ok boolean;
 purchase_snapshot jsonb; attempt text; uid_student uuid := 'cab00000-0000-0000-0000-000000000001';
 uid_buyer uuid := 'cab00000-0000-0000-0000-000000000002';
begin
 foreach purchase_scope in array array['chapter','subject','year','bundle'] loop
  insert into public.purchases(id,user_id,scope,status,course_id,chapter_id,subject_id,year_id,year_ids)
  values ('pub_purchase',uid_buyer,purchase_scope,'success','publication_course',
   case when purchase_scope='chapter' then 'pub_c2' end,
   case when purchase_scope='subject' then 'pub_s2' end,
   case when purchase_scope='year' then 'pub_y2' end,
   case when purchase_scope='bundle' then array['pub_y2','pub_y3'] end);
  select to_jsonb(p) into purchase_snapshot from public.purchases p where id='pub_purchase';
  foreach level in array array['course','year','subject','chapter','note','video','test','product'] loop
   case level
    when 'course' then update public.courses set active=false where id='publication_course';
    when 'year' then update public.years set active=false where id='pub_y2';
    when 'subject' then update public.subjects set active=false where id='pub_s2';
    when 'chapter' then update public.chapters set active=false where id='pub_c2';
    when 'note' then update public.notes set active=false where id in ('pub_n2','pub_preview');
    when 'video' then update public.videos set active=false where id='pub_v2';
    when 'test' then update public.quiz_tests set active=false where id='pub_q2';
    when 'product' then update public.products set active=false where id='pub_p2';
   end case;
   subject_ok := level not in ('course','year','subject');
   chapter_ok := subject_ok and level<>'chapter';
   note_ok := chapter_ok and level<>'note';
   video_ok := subject_ok and level<>'video';
   quiz_ok := subject_ok and level<>'test';
   foreach who in array array[uid_student,uid_buyer] loop
    perform pg_temp.publication_user(who);
    foreach tbl in array array['subjects','chapters','notes','videos','quiz_tests'] loop
     execute format('select count(*) from public.%I where id = %L',tbl,
      case tbl when 'subjects' then 'pub_s2' when 'chapters' then 'pub_c2' when 'notes' then 'pub_n2' when 'videos' then 'pub_v2' else 'pub_q2' end) into n;
     visible := case tbl when 'subjects' then subject_ok when 'chapters' then chapter_ok when 'notes' then note_ok when 'videos' then video_ok else quiz_ok end;
     perform pg_temp.check_publication((n=1)=visible,format('%s %s %s direct ID obeys publication for %s',purchase_scope,who,level,tbl));
    end loop;
    -- Search/global queries use exactly the same RLS even without parent joins.
    perform pg_temp.check_publication((exists(select 1 from public.notes where title like 'Paid note%' and id='pub_n2'))=note_ok,'global note search obeys hierarchy');
    perform pg_temp.check_publication((exists(select 1 from public.products where id='pub_p2'))=(level not in ('course','year','product')),'year product parents');
    perform pg_temp.check_publication((exists(select 1 from public.products where id='pub_subject_product'))=subject_ok,'subject product parents');
    perform pg_temp.check_publication((exists(select 1 from public.products where id='pub_chapter_product'))=chapter_ok,'chapter product parents');
    perform pg_temp.check_publication((exists(select 1 from public.products where id='pub_bundle_product'))=(level not in ('course','year')),'bundle requires every year published');
    perform pg_temp.check_publication(not exists(select 1 from storage.objects where bucket_id='notes' and name='pub_n2.pdf'),'buyers cannot bypass signed URL via Storage');
    perform pg_temp.check_publication(not exists(select 1 from public.notes where id='pub_n5'),'cross-course paid catalogue denied');
    perform pg_temp.check_publication(not exists(select 1 from public.videos where id='pub_v5'),'cross-course video catalogue denied');
    if who=uid_buyer then
     perform pg_temp.check_publication(public.user_owns_chapter('pub_c2'),'publication does not erase purchased entitlement');
    end if;
    attempt := 'pub_attempt_'||purchase_scope||'_'||level||'_'||right(who::text,1);
    if quiz_ok then
     perform pg_temp.check_publication(public.submit_quiz_attempt(attempt,'pub_q2',1,'[0]'::jsonb)->>'score'='1','published subject quiz remains usable');
    else
     begin
      perform public.submit_quiz_attempt(attempt,'pub_q2',1,'[0]'::jsonb);
      raise exception 'FAIL: unpublished quiz accepted through direct RPC';
     exception when invalid_parameter_value then
      perform pg_temp.check_publication(true,'unpublished quiz direct RPC denied');
     end;
    end if;
    perform pg_temp.publication_owner();
    -- Mirror the Edge Functions' service-role RPC context, without auth.uid().
    set local role service_role;
    perform pg_temp.check_publication(public.user_can_access_note(who,'pub_n2')=(note_ok and who=uid_buyer),'service paid note requires publication AND entitlement');
    perform pg_temp.check_publication(public.user_can_access_note(who,'pub_preview')=note_ok,'service free preview requires published parents');
    perform pg_temp.check_publication(public.user_can_access_video(who,'pub_v2')=video_ok,'service free video requires published parents');
    perform pg_temp.check_publication(not public.user_can_access_note(who,'pub_foreign_preview'),'cross-course preview denied');
    perform pg_temp.check_publication(not public.user_can_access_video(who,'pub_v5'),'cross-course video direct ID denied');
    reset role;
   end loop;
   -- Managers must still be able to see/edit drafts through their admin policies.
   perform pg_temp.publication_user('cab00000-0000-0000-0000-000000000003');
   perform pg_temp.check_publication(exists(select 1 from public.notes where id='pub_n2'),'admin draft management preserved');
   perform pg_temp.publication_owner();
   update public.courses set active=true where id='publication_course';
   update public.years set active=true where id='pub_y2';
   update public.subjects set active=true where id='pub_s2';
   update public.chapters set active=true where id='pub_c2';
   update public.notes set active=true where id in ('pub_n2','pub_preview');
   update public.videos set active=true where id='pub_v2';
   update public.quiz_tests set active=true where id='pub_q2';
   update public.products set active=true where id='pub_p2';
   perform pg_temp.check_publication((select to_jsonb(p)=purchase_snapshot from public.purchases p where id='pub_purchase'),'unpublish/republish leaves purchase record unchanged');
   perform pg_temp.check_publication(public.user_can_access_note(uid_buyer,'pub_n2'),'republishing restores original paid access');
  end loop;
  update public.purchases set status='refunded' where id='pub_purchase';
  perform pg_temp.check_publication(not public.user_can_access_note(uid_buyer,'pub_n2'),'republishing does not revive refunded purchase');
  delete from public.purchases where id='pub_purchase';
 end loop;
end $$;

-- A bundle must check its second year too; active first-year data stays browsable.
update public.years set active=false where id='pub_y3';
select pg_temp.publication_user('cab00000-0000-0000-0000-000000000001');
select pg_temp.check_publication(not exists(select 1 from public.products where id='pub_bundle_product'),'bundle with inactive second year is hidden');
select pg_temp.check_publication(exists(select 1 from public.products where id='pub_p2'),'another active year remains browsable');
select pg_temp.publication_owner();
update public.years set active=true where id='pub_y3';

select pg_temp.check_publication(not public.content_is_published('publication_other','pub_y2','pub_s2','pub_c2'),'spoofed course denied');
select pg_temp.check_publication(not public.content_is_published('publication_course','pub_y1','pub_s2','pub_c2'),'spoofed year denied');
select pg_temp.check_publication(not public.content_is_published('publication_course','pub_y2','pub_s1','pub_c2'),'spoofed subject denied');
select pg_temp.check_publication(not public.content_is_published('publication_course',null,null,'pub_c2'),'missing chapter ancestry fails closed');
select pg_temp.check_publication(not public.content_is_published('publication_course','pub_y2','pub_s2','pub_deleted'),'deleted parent fails closed');
select pg_temp.check_publication(not public.user_can_access_note('cab00000-0000-0000-0000-000000000002','pub_deleted'),'deleted note denied');
select pg_temp.check_publication(not has_function_privilege('anon','public.content_is_published(text,text,text,text)','execute'),'publication helper not anonymous');
select pg_temp.check_publication(not has_function_privilege('authenticated','public.user_can_access_note(uuid,text)','execute'),'note URL helper remains service-only');
select pg_temp.check_publication(not has_function_privilege('authenticated','public.user_can_access_video(uuid,text)','execute'),'video URL helper remains service-only');
select pg_temp.check_publication((select count(*)=6 from pg_policies where schemaname='public'
 and policyname in ('subjects_published_ancestry','chapters_published_ancestry','notes_published_ancestry',
 'videos_published_ancestry','quiz_tests_published_ancestry','products_published_ancestry')
 and permissive='RESTRICTIVE' and cmd='SELECT' and roles=array['authenticated']::name[]),'publication guards are restrictive SELECT policies');
select 'PASS content_publication_checks: '||count(*)||' assertions' from publication_results;
rollback;
