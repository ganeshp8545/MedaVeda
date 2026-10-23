-- The two-argument service helpers remain for older deployed handlers, but
-- never confer admin-only access when MFA is required. New handlers pass the
-- AAL from the same verified bearer token that identified p_user.
begin;

create or replace function public.user_can_access_note(p_user uuid, p_note_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null
    and exists (select 1 from public.profiles pr
      where pr.id = p_user and not coalesce(pr.blocked, false))
    and exists (
      select 1 from public.notes n
      join public.chapters c on c.id = n.chapter_id
      where n.id = p_note_id and n.active
        and public.content_is_published(n.course_id, n.year_id, c.subject_id, n.chapter_id)
        and (
          (n.is_free_preview and exists (select 1 from public.profiles pr
            where pr.id = p_user and pr.course_id = n.course_id))
          or (not public.admin_mfa_required()
            and exists (select 1 from public.admins a where a.id = p_user))
          or exists (
            select 1 from public.purchases p
            where p.user_id = p_user and p.status = 'success'
              and p.course_id = c.course_id
              and ((p.scope = 'chapter' and p.chapter_id = c.id)
                or (p.scope = 'subject' and p.subject_id = c.subject_id)
                or (p.scope = 'year' and p.year_id = c.year_id)
                or (p.scope = 'bundle' and c.year_id = any(p.year_ids)))
          )
        )
    );
$$;

create or replace function public.user_can_access_video(p_user uuid, p_video_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null
    and exists (select 1 from public.profiles pr
      where pr.id = p_user and not coalesce(pr.blocked, false))
    and exists (
      select 1 from public.videos v where v.id = p_video_id and v.active
        and public.content_is_published(v.course_id, v.year_id, v.subject_id)
        and (
          exists (select 1 from public.profiles pr
            where pr.id = p_user and pr.course_id = v.course_id)
          or (not public.admin_mfa_required()
            and exists (select 1 from public.admins a where a.id = p_user))
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

create function public.user_can_access_note_with_aal(
  p_user uuid, p_note_id text, p_aal text
) returns boolean language sql stable security definer set search_path = public as $$
  select public.user_can_access_note(p_user, p_note_id)
    or (p_aal = 'aal2' and public.admin_mfa_required()
      and exists (select 1 from public.profiles pr
        where pr.id = p_user and not coalesce(pr.blocked, false))
      and exists (select 1 from public.admins a where a.id = p_user)
      and exists (select 1 from public.notes n
        join public.chapters c on c.id = n.chapter_id
        where n.id = p_note_id and n.active
          and public.content_is_published(n.course_id, n.year_id, c.subject_id, n.chapter_id)));
$$;

create function public.user_can_access_video_with_aal(
  p_user uuid, p_video_id text, p_aal text
) returns boolean language sql stable security definer set search_path = public as $$
  select public.user_can_access_video(p_user, p_video_id)
    or (p_aal = 'aal2' and public.admin_mfa_required()
      and exists (select 1 from public.profiles pr
        where pr.id = p_user and not coalesce(pr.blocked, false))
      and exists (select 1 from public.admins a where a.id = p_user)
      and exists (select 1 from public.videos v
        where v.id = p_video_id and v.active
          and public.content_is_published(v.course_id, v.year_id, v.subject_id)));
$$;

revoke all on function public.user_can_access_note(uuid, text) from public, anon, authenticated;
revoke all on function public.user_can_access_video(uuid, text) from public, anon, authenticated;
revoke all on function public.user_can_access_note_with_aal(uuid, text, text) from public, anon, authenticated;
revoke all on function public.user_can_access_video_with_aal(uuid, text, text) from public, anon, authenticated;
grant execute on function public.user_can_access_note(uuid, text) to service_role;
grant execute on function public.user_can_access_video(uuid, text) to service_role;
grant execute on function public.user_can_access_note_with_aal(uuid, text, text) to service_role;
grant execute on function public.user_can_access_video_with_aal(uuid, text, text) to service_role;

commit;
