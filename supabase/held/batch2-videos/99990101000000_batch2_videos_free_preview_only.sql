-- ============================================================================
-- Batch 2 / F1: paid video URLs are no longer readable by students.
--
-- >>> DO NOT DEPLOY BEFORE THE NEW MOBILE BUILD IS OUT AND app_config.min_app_version
-- >>> IS RAISED TO 1.2.0. This migration refuses to run otherwise (guard below).
--
-- Before: videos_public_read_active let ANY student enrolled in the course read
-- every active video row, including videos.youtube_url of paid videos, without a
-- purchase (and set_my_course_year lets a student enrol in any course).
--
-- After:
--   * a signed-in student can SELECT only free-preview videos from the table;
--   * every other video is reached through two server-side paths that never
--     return a URL to the list:
--       - get_videos(subject, course): the list (title, order, lock state) for the
--         videos the student may SEE, with can_play computed by the same
--         entitlement function the Edge Function uses (user_can_access_video);
--       - the get-video-url Edge Function: returns the URL only when can_play;
--   * admins are unaffected (the admin-write policies also cover their reads, and
--     the admin panel keeps reading videos.youtube_url as before).
--
-- Why row level and not a column REVOKE on youtube_url: the admin panel reads and
-- writes videos.youtube_url as the same `authenticated` database role students
-- use, so a column privilege would break it. Row level closes the hole (a paid
-- URL is never in a row a student can select) without an admin-panel release.
--
-- Old builds (< 1.2.0) read the table directly and would suddenly see only the
-- free-preview videos - which is exactly why the guard forces them to update
-- first (UpdateRequiredScreen).
-- ============================================================================

-- ---- guard: refuse until old builds are locked out ---------------------------
do $$
declare
  v_min text;
  v_have int[];
  v_need constant int[] := array[1, 2, 0];   -- the build that lists videos via get_videos()
begin
  select value into v_min from public.app_config where key = 'min_app_version';
  if v_min is null or v_min !~ '^[0-9]+(\.[0-9]+){0,2}$' then
    raise exception 'BATCH 2 REFUSED: app_config.min_app_version is missing or malformed (%). Set it to 1.2.0 (or higher) once the 1.2.0 build is live, then re-run.', v_min;
  end if;
  v_have := string_to_array(v_min, '.')::int[];
  while coalesce(array_length(v_have, 1), 0) < 3 loop v_have := v_have || 0; end loop;
  if v_have < v_need then
    raise exception 'BATCH 2 REFUSED: app_config.min_app_version is % but builds older than 1.2.0 read videos.youtube_url straight from the table and would break. Publish 1.2.0, raise min_app_version to 1.2.0, then re-run.', v_min;
  end if;
end $$;

-- ---- 1. students see only free-preview rows in the table --------------------
drop policy if exists videos_public_read_active on public.videos;
drop policy if exists videos_read_free_preview on public.videos;
create policy videos_read_free_preview on public.videos
  for select to authenticated
  using (active = true and is_free_preview = true);

-- ---- 2. the list the app now uses (no URL, ever) -----------------------------
create or replace function public.get_videos(p_subject_id text default null, p_course_id text default null)
returns table (
  id text,
  title text,
  subject_id text,
  subject_title text,
  year_id text,
  year_title text,
  course_id text,
  "order" integer,
  is_free_preview boolean,
  can_play boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.title, v.subject_id, s.title, v.year_id, y.title, v.course_id, v."order",
         v.is_free_preview,
         public.user_can_access_video(auth.uid(), v.id)
    from public.videos v
    left join public.subjects s on s.id = v.subject_id
    left join public.years y on y.id = v.year_id
   where auth.uid() is not null
     and v.active
     and (p_subject_id is null or v.subject_id = p_subject_id)
     and (p_course_id is null or v.course_id = p_course_id)
     -- same visibility the table had before: your course/year, something you bought, or a free preview
     and (v.is_free_preview or public.has_content_access(v.course_id, v.year_id))
   order by v."order", v.created_at;
$$;

revoke all on function public.get_videos(text, text) from public, anon;
grant execute on function public.get_videos(text, text) to authenticated;
