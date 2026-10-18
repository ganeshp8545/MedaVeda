-- Server-scored MCQ attempts. Legacy quiz_scores rows remain readable but are
-- not migrated into verified results because their client scores are untrusted.
begin;

alter table public.quiz_tests
  add column if not exists question_revision bigint not null default 1;

create or replace function public.bump_quiz_question_revision()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.question_revision := old.question_revision +
    case when new.questions is distinct from old.questions then 1 else 0 end;
  return new;
end $$;
drop trigger if exists bump_quiz_question_revision on public.quiz_tests;
create trigger bump_quiz_question_revision before update on public.quiz_tests
  for each row execute function public.bump_quiz_question_revision();
revoke all on function public.bump_quiz_question_revision() from public, anon, authenticated;

create table if not exists public.verified_quiz_attempts (
  id text primary key check (length(id) between 8 and 160),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Preserve the source identity after an admin deletes an obsolete test;
  -- duplicate retries must still resolve to the original verified result.
  test_id text not null,
  test_title text not null,
  subject_id text,
  question_revision bigint not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  score integer not null check (score >= 0),
  total integer not null check (total > 0 and score <= total),
  percentage integer not null check (percentage between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists verified_quiz_attempts_user_recent_idx
  on public.verified_quiz_attempts(user_id, created_at desc);
create index if not exists verified_quiz_attempts_test_idx
  on public.verified_quiz_attempts(test_id);
alter table public.verified_quiz_attempts enable row level security;
revoke all on public.verified_quiz_attempts from public, anon, authenticated;
grant select on public.verified_quiz_attempts to authenticated;
drop policy if exists verified_quiz_attempts_read on public.verified_quiz_attempts;
create policy verified_quiz_attempts_read on public.verified_quiz_attempts
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.am_i_admin()));

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
  if not found or not exists (
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
revoke all on function public.submit_quiz_attempt(text,text,bigint,jsonb) from public, anon;
grant execute on function public.submit_quiz_attempt(text,text,bigint,jsonb) to authenticated;

commit;
