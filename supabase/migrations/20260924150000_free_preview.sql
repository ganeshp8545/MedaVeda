-- ============================================================================
-- MEDIUM 6 — "first PDF of every chapter is free" enforced by the backend
-- ============================================================================
--   * is_free_preview flag on notes and videos (editable by admins through the
--     existing admin write policies / the admin panel form).
--   * Backfill: the first note of every chapter is flagged (ordered by "order",
--     created_at, id). Videos have no chapter column (they belong to a subject),
--     so the first video of every SUBJECT is flagged - see the notes in
--     docs/security/SECURITY_FIX_NOTES.md.
--   * user_can_access_note / user_can_access_video: the entitlement decision the
--     signed-URL Edge Functions call (service_role only). Preview = any signed-in,
--     non-blocked user. Otherwise: an active purchase that covers the chapter /
--     subject (chapter, subject, year or bundle scope), same rule as
--     user_owns_chapter(), but for an explicit user id.
--   * Quizzes stay free (unchanged).
-- Existing purchases are untouched. Idempotent: re-running does not re-flag
-- notes an admin has since un-flagged unless a chapter has NO flagged note left
-- AND this migration is re-applied by hand.
begin;

alter table public.notes  add column if not exists is_free_preview boolean not null default false;
alter table public.videos add column if not exists is_free_preview boolean not null default false;

-- Backfill (only rows currently false, only for chapters/subjects with no preview yet)
with ranked as (
  select n.id,
         row_number() over (partition by n.chapter_id order by n."order", n.created_at, n.id) as rn,
         bool_or(n.is_free_preview) over (partition by n.chapter_id) as has_preview
  from public.notes n
  where n.active
)
update public.notes n set is_free_preview = true
from ranked r
where r.id = n.id and r.rn = 1 and not r.has_preview;

with ranked as (
  select v.id,
         row_number() over (partition by v.subject_id order by v."order", v.created_at, v.id) as rn,
         bool_or(v.is_free_preview) over (partition by v.subject_id) as has_preview
  from public.videos v
  where v.active
)
update public.videos v set is_free_preview = true
from ranked r
where r.id = v.id and r.rn = 1 and not r.has_preview;

create index if not exists idx_notes_free_preview  on public.notes(chapter_id)  where is_free_preview;
create index if not exists idx_videos_free_preview on public.videos(subject_id) where is_free_preview;

-- ---------------------------------------------------------------------------
-- Entitlement functions (server-side only)
-- ---------------------------------------------------------------------------
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
        and (
          n.is_free_preview
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
      from public.videos v
      join public.subjects s on s.id = v.subject_id
      where v.id = p_video_id
        and v.active
        and (
          v.is_free_preview
          or exists (select 1 from public.admins a where a.id = p_user)
          or exists (
            select 1
            from public.purchases p
            where p.user_id = p_user
              and p.status = 'success'
              and p.course_id = s.course_id
              and (
                (p.scope = 'subject' and p.subject_id = s.id)
                or (p.scope = 'year' and p.year_id = s.year_id)
                or (p.scope = 'bundle' and s.year_id = any (p.year_ids))
                or (p.scope = 'chapter' and exists (
                      select 1 from public.chapters c
                      where c.id = p.chapter_id and c.subject_id = s.id))
              )
          )
        )
    );
$$;

revoke all on function public.user_can_access_note(uuid, text)  from public, anon, authenticated;
revoke all on function public.user_can_access_video(uuid, text) from public, anon, authenticated;
grant execute on function public.user_can_access_note(uuid, text)  to service_role;
grant execute on function public.user_can_access_video(uuid, text) to service_role;

commit;
