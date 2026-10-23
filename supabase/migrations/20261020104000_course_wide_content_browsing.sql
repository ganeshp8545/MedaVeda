-- Registration year is profile metadata, never a catalogue visibility rule.
-- Keep the helper signature and existing admin/purchase branches for compatibility.
-- Publication is independent of registration year and purchased entitlements.
-- Existing permissive RLS/write policies and protected PDF storage stay intact.
begin;

-- A shared, fail-closed ancestor check for catalogue RLS and service-role URLs.
-- SECURITY DEFINER avoids recursive RLS when checking the same parent tables.
-- Videos/tests have a subject parent, not a chapter parent, in this schema.
create or replace function public.content_is_published(
  p_course_id text, p_year_id text, p_subject_id text default null, p_chapter_id text default null
)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from public.courses co where co.id = p_course_id and co.active)
    and (p_year_id is null or exists (
      select 1 from public.years y
      where y.id = p_year_id and y.course_id = p_course_id and y.active
    ))
    and (p_subject_id is null or exists (
      select 1 from public.subjects s
      where s.id = p_subject_id and s.course_id = p_course_id and s.year_id = p_year_id and s.active
    ))
    and (p_chapter_id is null or exists (
      select 1 from public.chapters c
      join public.subjects s on s.id = c.subject_id and s.active
        and s.course_id = p_course_id and s.year_id = p_year_id
      where c.id = p_chapter_id and c.course_id = p_course_id and c.year_id = p_year_id and c.active
        and (p_subject_id is null or c.subject_id = p_subject_id)
    ));
$$;
revoke all on function public.content_is_published(text, text, text, text) from public, anon;
grant execute on function public.content_is_published(text, text, text, text) to authenticated, service_role;

create or replace function public.has_content_access(p_course_id text, p_year_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.am_i_admin()
    or (public.content_is_published(p_course_id, p_year_id) and (exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.course_id = p_course_id
    )
    or exists (
      select 1
      from public.purchases pu
      left join public.chapters ch on pu.scope = 'chapter' and ch.id = pu.chapter_id
      left join public.subjects sb on pu.scope = 'subject' and sb.id = pu.subject_id
      where pu.user_id = auth.uid()
        and pu.status = 'success'
        and pu.course_id = p_course_id
        and (
          p_year_id is null
          or (pu.scope = 'year' and pu.year_id = p_year_id)
          or (pu.scope = 'bundle' and p_year_id = any(pu.year_ids))
          or (pu.scope = 'chapter' and ch.year_id = p_year_id)
          or (pu.scope = 'subject' and sb.year_id = p_year_id)
        )
    )));
$$;

-- Restrictive SELECT guards compose with the existing entitlement/course policies.
-- The admin exception preserves draft management; it grants no student access
-- and does not change INSERT/UPDATE/DELETE policies or purchase records.
create policy subjects_published_ancestry on public.subjects as restrictive
  for select to authenticated using (
    public.am_i_admin() or (active and public.content_is_published(course_id, year_id, id))
  );
create policy chapters_published_ancestry on public.chapters as restrictive
  for select to authenticated using (
    public.am_i_admin() or (active and public.content_is_published(course_id, year_id, subject_id, id))
  );
create policy notes_published_ancestry on public.notes as restrictive
  for select to authenticated using (
    public.am_i_admin() or (active and public.content_is_published(course_id, year_id, null, chapter_id))
  );
create policy videos_published_ancestry on public.videos as restrictive
  for select to authenticated using (
    public.am_i_admin() or (active and public.content_is_published(course_id, year_id, subject_id))
  );
create policy quiz_tests_published_ancestry on public.quiz_tests as restrictive
  for select to authenticated using (
    public.am_i_admin() or (active and public.content_is_published(course_id, year_id, subject_id))
  );
create policy products_published_ancestry on public.products as restrictive
  for select to authenticated using (
    public.am_i_admin() or (active and case scope
      when 'chapter' then exists (
        select 1 from public.chapters c where c.id = products.chapter_id
          and public.content_is_published(products.course_id, c.year_id, c.subject_id, c.id)
      )
      when 'subject' then exists (
        select 1 from public.subjects s where s.id = products.subject_id
          and public.content_is_published(products.course_id, s.year_id, s.id)
      )
      when 'year' then year_id is not null and public.content_is_published(course_id, year_id)
      when 'bundle' then public.content_is_published(course_id, null)
        and cardinality(year_ids) > 0 and not exists (
          select 1 from unnest(year_ids) y(id)
          where y.id is null or not public.content_is_published(products.course_id, y.id)
        )
      else false
    end)
  );

-- Service-role URL endpoints must enforce course isolation explicitly.
create or replace function public.user_can_access_note(p_user uuid, p_note_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    p_user is not null
    and exists (select 1 from public.profiles pr where pr.id = p_user and not coalesce(pr.blocked, false))
    and exists (
      select 1
      from public.notes n
      join public.chapters c on c.id = n.chapter_id
      where n.id = p_note_id
        and n.active
        and public.content_is_published(n.course_id, n.year_id, c.subject_id, n.chapter_id)
        and (
          (n.is_free_preview and exists (select 1 from public.profiles pr
            where pr.id = p_user and pr.course_id = n.course_id))
          or exists (select 1 from public.admins a where a.id = p_user)
          or exists (
            select 1
            from public.purchases p
            where p.user_id = p_user
              and p.status = 'success'
              and p.course_id = c.course_id
              and (
                (p.scope = 'chapter' and p.chapter_id = c.id)
                or (p.scope = 'subject' and p.subject_id = c.subject_id)
                or (p.scope = 'year' and p.year_id = c.year_id)
                or (p.scope = 'bundle' and c.year_id = any (p.year_ids))
              )
          )
        )
    );
$$;

create or replace function public.user_can_access_video(p_user uuid, p_video_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null
    and exists (select 1 from public.profiles pr where pr.id = p_user and not coalesce(pr.blocked, false))
    and exists (
      select 1 from public.videos v where v.id = p_video_id and v.active
        and public.content_is_published(v.course_id, v.year_id, v.subject_id)
        and (
          exists (select 1 from public.profiles pr where pr.id = p_user and pr.course_id = v.course_id)
          or exists (select 1 from public.admins a where a.id = p_user)
          or exists (
            select 1 from public.purchases pu
            left join public.chapters ch on pu.scope = 'chapter' and ch.id = pu.chapter_id
            left join public.subjects sb on pu.scope = 'subject' and sb.id = pu.subject_id
            where pu.user_id = p_user and pu.status = 'success' and pu.course_id = v.course_id
              and ((pu.scope = 'year' and pu.year_id = v.year_id)
                or (pu.scope = 'bundle' and v.year_id = any(pu.year_ids))
                or (pu.scope = 'chapter' and ch.year_id = v.year_id)
                or (pu.scope = 'subject' and sb.year_id = v.year_id))
          )
        )
    );
$$;

-- SECURITY DEFINER quiz submissions must check catalogue access themselves.
create or replace function public.submit_quiz_attempt(
  p_attempt_id text, p_test_id text, p_question_revision bigint, p_answers jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_test public.quiz_tests%rowtype;
  v_existing public.verified_quiz_attempts%rowtype;
  v_question jsonb;
  v_selected jsonb;
  v_option_index integer;
  v_total integer;
  v_score integer := 0;
  v_i integer;
begin
  if v_user is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_user and not coalesce(blocked, false)) then
    raise exception 'Account unavailable' using errcode = '42501';
  end if;
  if p_attempt_id is null or length(p_attempt_id) not between 8 and 160
     or p_test_id is null or p_question_revision is null
     or p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Invalid attempt' using errcode = '22023';
  end if;

  -- A dropped response can be retried even after the test has since changed.
  select * into v_existing from public.verified_quiz_attempts where id = p_attempt_id;
  if found then
    if v_existing.user_id <> v_user or v_existing.test_id is distinct from p_test_id
       or v_existing.question_revision <> p_question_revision or v_existing.answers <> p_answers then
      raise exception 'Attempt id belongs to another submission' using errcode = '23505';
    end if;
    return jsonb_build_object('status','verified','score',v_existing.score,
      'total',v_existing.total,'percentage',v_existing.percentage);
  end if;

  if not public.rate_limit_hit('verified-quiz:' || v_user::text, 120, 3600) then
    return jsonb_build_object('status','rate_limited');
  end if;

  select * into v_test from public.quiz_tests where id = p_test_id and active;
  if not found
     or not public.content_is_published(v_test.course_id, v_test.year_id, v_test.subject_id)
     or not public.has_content_access(v_test.course_id, v_test.year_id) or not exists (
    select 1 from public.subjects s where s.id = v_test.subject_id
      and s.year_id = v_test.year_id and s.course_id = v_test.course_id
  ) then
    raise exception 'Test unavailable' using errcode = '22023';
  end if;
  if v_test.question_revision <> p_question_revision then
    return jsonb_build_object('status','stale');
  end if;
  if jsonb_typeof(v_test.questions) <> 'array' then
    raise exception 'Test questions invalid' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(v_test.questions);
  if v_total < 1 or v_total > 100 or jsonb_array_length(p_answers) <> v_total then
    raise exception 'Answer count mismatch' using errcode = '22023';
  end if;

  for v_i in 0..v_total-1 loop
    v_question := v_test.questions -> v_i;
    v_selected := p_answers -> v_i;
    if jsonb_typeof(v_question) <> 'object'
       or jsonb_typeof(v_question->'options') <> 'array'
       or jsonb_typeof(v_question->'answer') <> 'string'
       or jsonb_array_length(v_question->'options') < 2 then
      raise exception 'Test question invalid' using errcode = '22023';
    end if;
    if v_selected = 'null'::jsonb then continue; end if;
    if jsonb_typeof(v_selected) <> 'number' or (v_selected #>> '{}') !~ '^[0-9]+$' then
      raise exception 'Answer index invalid' using errcode = '22023';
    end if;
    v_option_index := (v_selected #>> '{}')::integer;
    if v_option_index >= jsonb_array_length(v_question->'options') then
      raise exception 'Answer index out of range' using errcode = '22023';
    end if;
    if v_question->'options'->>v_option_index = v_question->>'answer' then
      v_score := v_score + 1;
    end if;
  end loop;

  insert into public.verified_quiz_attempts
    (id,user_id,test_id,test_title,subject_id,question_revision,answers,score,total,percentage)
  values (p_attempt_id,v_user,p_test_id,v_test.title,v_test.subject_id,p_question_revision,
    p_answers,v_score,v_total,round(v_score * 100.0 / v_total)::integer)
  on conflict (id) do nothing;

  select * into v_existing from public.verified_quiz_attempts where id = p_attempt_id;
  if v_existing.user_id <> v_user or v_existing.test_id is distinct from p_test_id
     or v_existing.question_revision <> p_question_revision or v_existing.answers <> p_answers then
    raise exception 'Attempt id belongs to another submission' using errcode = '23505';
  end if;
  return jsonb_build_object('status','verified','score',v_existing.score,
    'total',v_existing.total,'percentage',v_existing.percentage);
end $$;

-- CREATE OR REPLACE retains existing grants; explicitly retain service-only URLs.
revoke all on function public.user_can_access_note(uuid, text) from public, anon, authenticated;
revoke all on function public.user_can_access_video(uuid, text) from public, anon, authenticated;
grant execute on function public.user_can_access_note(uuid, text) to service_role;
grant execute on function public.user_can_access_video(uuid, text) to service_role;
commit;
