-- Disposable database only. Fixtures and MFA flag are rolled back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_secure(ok boolean, label text)
returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.as_user(p_user uuid, p_aal text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;

insert into auth.users(id, email) values
  ('cafe0000-0000-0000-0000-000000000001', 'quiz-student@example.test'),
  ('cafe0000-0000-0000-0000-000000000002', 'quiz-outsider@example.test'),
  ('cafe0000-0000-0000-0000-000000000003', 'quiz-admin@example.test');
insert into public.admins(id,email) values
  ('cafe0000-0000-0000-0000-000000000003','quiz-admin@example.test');
insert into public.courses(id,name,code) values
  ('qa_secure_a','Secure A','QA_SEC_A'),('qa_secure_b','Secure B','QA_SEC_B');
insert into public.years(id,title,course_id) values
  ('qa_secure_y1','Year 1','qa_secure_a'),('qa_secure_y2','Year 2','qa_secure_a'),
  ('qa_secure_yb','Other year','qa_secure_b');
insert into public.subjects(id,title,year_id) values
  ('qa_secure_s1','Subject A','qa_secure_y1'),
  ('qa_secure_s2','Other year subject','qa_secure_y2'),
  ('qa_secure_sb','Subject B','qa_secure_yb');
insert into public.chapters(id,title,subject_id) values
  ('qa_secure_c1','Chapter A','qa_secure_s1'),('qa_secure_cb','Chapter B','qa_secure_sb');
insert into public.notes(id,title,chapter_id,pdf_url) values
  ('qa_secure_n1','Paid note','qa_secure_c1','qa-secure-n1.pdf'),
  ('qa_secure_nb','Other paid note','qa_secure_cb','qa-secure-nb.pdf');
insert into public.videos(id,title,subject_id,youtube_url) values
  ('qa_secure_v1','Free video','qa_secure_s1','https://youtu.be/example'),
  ('qa_secure_vb','Other video','qa_secure_sb','https://youtu.be/example');
insert into public.quiz_tests(id,title,subject_id,questions) values
  ('qa_secure_q1','Quiz A','qa_secure_s1',
    '[{"question":"Choose","options":["yes","no"],"answer":"yes","answer_key":"yes","explanation":"secret"}]'),
  ('qa_secure_q2','Other-year quiz','qa_secure_s2',
    '[{"question":"Choose","options":["yes","no"],"answer":"yes"}]'),
  ('qa_secure_qb','Quiz B','qa_secure_sb',
    '[{"question":"Choose","options":["yes","no"],"answer":"yes"}]');
select set_config('app.allow_profile_admin_fields','true',true);
update public.profiles set course_id='qa_secure_a',year_id='qa_secure_y1'
  where id='cafe0000-0000-0000-0000-000000000001';
update public.profiles set course_id='qa_secure_b',year_id='qa_secure_yb'
  where id='cafe0000-0000-0000-0000-000000000002';
select set_config('app.allow_profile_admin_fields','false',true);

select pg_temp.assert_secure(
  not has_table_privilege('authenticated','public.quiz_tests','select')
  and not has_column_privilege('authenticated','public.quiz_tests','questions','select')
  and has_column_privilege('authenticated','public.quiz_tests','id','select'),
  'student has metadata SELECT but no answer column');
select pg_temp.assert_secure(
  not has_function_privilege('anon','public.get_public_quiz_tests(text,text)','execute')
  and not has_function_privilege('authenticated','public.user_can_access_note_with_aal(uuid,text,text)','execute')
  and not has_function_privilege('authenticated','public.user_can_access_video_with_aal(uuid,text,text)','execute'),
  'RPC and URL helper grants');

do $$ declare rows jsonb; q jsonb;
begin
  perform pg_temp.as_user('cafe0000-0000-0000-0000-000000000001','aal1');
  perform id from public.quiz_tests where id='qa_secure_q1';
  begin
    perform questions from public.quiz_tests where id='qa_secure_q1';
    raise exception 'FAIL: student selected raw answer column';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.quiz_tests where id='qa_secure_q1';
    raise exception 'FAIL: student selected raw quiz row';
  exception when insufficient_privilege then null; end;
  select jsonb_agg(x) into rows from public.get_public_quiz_tests('qa_secure_s1',null) x;
  perform pg_temp.assert_secure(jsonb_array_length(rows)=1, 'own course quiz visible');
  q := rows->0->'questions'->0;
  perform pg_temp.assert_secure(q = '{"question":"Choose","options":["yes","no"]}'::jsonb,
    'strict question allowlist excludes all grading secrets');
  select jsonb_agg(x) into rows from public.get_public_quiz_tests(null,'qa_secure_q2') x;
  perform pg_temp.assert_secure(jsonb_array_length(rows)=1, 'other year in own course visible');
  perform pg_temp.assert_secure(not exists(select 1 from public.get_public_quiz_tests(null,'qa_secure_qb')),
    'other course quiz denied');
  begin
    perform count(*) from public.get_admin_quiz_tests();
    raise exception 'FAIL: student obtained admin answer RPC';
  exception when insufficient_privilege then null; end;
  perform pg_temp.assert_secure(
    public.submit_quiz_attempt('qa_secure_attempt1','qa_secure_q1',1,'[0]'::jsonb)->>'score'='1',
    'server grades authorized submission');
  begin
    perform public.submit_quiz_attempt('qa_secure_attempt2','qa_secure_qb',1,'[0]'::jsonb);
    raise exception 'FAIL: other-course quiz submission accepted';
  exception when invalid_parameter_value then null; end;
  perform pg_temp.as_owner();
end $$;

select pg_temp.assert_secure(
  not public.user_can_access_note('cafe0000-0000-0000-0000-000000000001','qa_secure_n1')
  and public.user_can_access_video('cafe0000-0000-0000-0000-000000000001','qa_secure_v1')
  and not public.user_can_access_video('cafe0000-0000-0000-0000-000000000001','qa_secure_vb')
  and not public.user_can_access_note('cafe0000-0000-0000-0000-000000000002','qa_secure_n1'),
  'paid note, free video, cross-course restrictions');
insert into public.purchases(id,user_id,scope,status,course_id,chapter_id)
values ('qa_secure_purchase','cafe0000-0000-0000-0000-000000000001',
  'chapter','success','qa_secure_a','qa_secure_c1');
select pg_temp.assert_secure(
  public.user_can_access_note('cafe0000-0000-0000-0000-000000000001','qa_secure_n1'),
  'successful chapter purchase unlocks paid note');
update public.purchases set status='refunded' where id='qa_secure_purchase';
select pg_temp.assert_secure(
  not public.user_can_access_note('cafe0000-0000-0000-0000-000000000001','qa_secure_n1'),
  'refund removes paid note access');

update public.admin_settings set require_mfa=true where id;
select pg_temp.assert_secure(
  not public.user_can_access_note('cafe0000-0000-0000-0000-000000000003','qa_secure_n1')
  and not public.user_can_access_video('cafe0000-0000-0000-0000-000000000003','qa_secure_v1')
  and not public.user_can_access_note_with_aal('cafe0000-0000-0000-0000-000000000003','qa_secure_n1','aal1')
  and not public.user_can_access_video_with_aal('cafe0000-0000-0000-0000-000000000003','qa_secure_v1','aal1')
  and public.user_can_access_note_with_aal('cafe0000-0000-0000-0000-000000000003','qa_secure_n1','aal2')
  and public.user_can_access_video_with_aal('cafe0000-0000-0000-0000-000000000003','qa_secure_v1','aal2'),
  'old admin helper denied at MFA; verified AAL2 helper allowed');
do $$
begin
  perform pg_temp.as_user('cafe0000-0000-0000-0000-000000000003','aal1');
  begin
    perform count(*) from public.get_admin_quiz_tests();
    raise exception 'FAIL: AAL1 admin obtained answer RPC';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_user('cafe0000-0000-0000-0000-000000000003','aal2');
  perform pg_temp.assert_secure(
    (select questions->0->>'answer' from public.get_admin_quiz_tests('qa_secure_a',null)
      where id='qa_secure_q1')='yes', 'AAL2 admin can edit answer key');
  perform pg_temp.as_owner();
end $$;
rollback;
\echo 'PASS quiz_answer_and_admin_mfa_checks'
