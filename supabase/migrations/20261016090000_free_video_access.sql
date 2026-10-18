-- All educational videos are free. Keep the existing signed-link endpoint
-- usable by signed-in, nonblocked students without a purchase. Paid notes
-- continue to use user_can_access_note and the private notes bucket.
begin;
create or replace function public.user_can_access_video(p_user uuid,p_video_id text)
returns boolean language sql stable security definer set search_path=public as $$
  select p_user is not null
    and exists(select 1 from public.profiles pr where pr.id=p_user and not coalesce(pr.blocked,false))
    and exists(select 1 from public.videos v where v.id=p_video_id and v.active);
$$;
revoke all on function public.user_can_access_video(uuid,text) from public,anon,authenticated;
grant execute on function public.user_can_access_video(uuid,text) to service_role;
commit;
