-- Students may read quiz metadata, but only this RPC may return questions.
-- Keep the grading key in quiz_tests.questions for submit_quiz_attempt.
begin;

revoke select on public.quiz_tests from public, anon, authenticated;
grant select (id, title, subject_id, year_id, course_id, "order", active,
  created_at, question_revision) on public.quiz_tests to authenticated;

create function public.get_public_quiz_tests(
  p_subject_id text default null, p_test_id text default null
) returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.id, 'title', q.title, 'subject_id', q.subject_id,
    'year_id', q.year_id, 'course_id', q.course_id, 'order', q."order",
    'active', q.active, 'question_revision', q.question_revision,
    'subjects', jsonb_build_object('title', s.title),
    'years', jsonb_build_object('title', y.title),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question', item.value->'question', 'options', item.value->'options'
      ) order by item.ordinality)
      from jsonb_array_elements(case when jsonb_typeof(q.questions) = 'array'
        then q.questions else '[]'::jsonb end)
        with ordinality as item(value, ordinality)
    ), '[]'::jsonb)
  )
  from public.quiz_tests q
  join public.subjects s on s.id = q.subject_id
  join public.years y on y.id = q.year_id
  where (p_subject_id is not null or p_test_id is not null)
    and (p_subject_id is null or q.subject_id = p_subject_id)
    and (p_test_id is null or q.id = p_test_id)
    and q.active
    and exists (select 1 from public.profiles pr
      where pr.id = auth.uid() and not coalesce(pr.blocked, false))
    and public.content_is_published(q.course_id, q.year_id, q.subject_id)
    and public.has_content_access(q.course_id, q.year_id)
  order by q."order", q.id;
$$;
revoke all on function public.get_public_quiz_tests(text, text) from public, anon;
grant execute on function public.get_public_quiz_tests(text, text) to authenticated;

-- The admin editor needs the key to edit a test. The same AAL2 gate used by
-- admin RLS also protects this definer endpoint.
create function public.get_admin_quiz_tests(
  p_course_id text default null, p_year_id text default null
) returns setof public.quiz_tests language plpgsql stable security definer
  set search_path = public, pg_temp as $$
begin
  if not public.am_i_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return query select q.* from public.quiz_tests q
    where (p_course_id is null or q.course_id = p_course_id)
      and (p_year_id is null or q.year_id = p_year_id)
    order by q.created_at desc, q.id;
end $$;
revoke all on function public.get_admin_quiz_tests(text, text) from public, anon;
grant execute on function public.get_admin_quiz_tests(text, text) to authenticated;

commit;
