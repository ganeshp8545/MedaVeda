-- Referral history for the referrer ("Refer & Earn" screen).
--
-- A student can only read their OWN profiles row under RLS, so joining the
-- referred user's name client-side would always come back empty. This
-- security definer RPC returns just the referred user's FIRST NAME (never
-- email/phone) for referrals where the caller is the referrer.
-- Depends on 20260919120000_multi_course_and_referrals.sql.

create or replace function public.get_my_referrals()
returns table (
  id uuid,
  referrer_id uuid,
  referred_id uuid,
  referred_name text,
  code_used text,
  status text,
  created_at timestamptz,
  qualified_at timestamptz,
  rewarded_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.id,
    r.referrer_id,
    r.referred_id,
    nullif(split_part(trim(coalesce(p.name, '')), ' ', 1), '') as referred_name,
    r.code_used,
    r.status,
    r.created_at,
    r.qualified_at,
    r.rewarded_at
  from public.referrals r
  left join public.profiles p on p.id = r.referred_id
  where r.referrer_id = auth.uid()
  order by r.created_at desc;
$$;

revoke all on function public.get_my_referrals() from public;
grant execute on function public.get_my_referrals() to authenticated;
