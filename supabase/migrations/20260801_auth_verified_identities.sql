-- Verified identity metadata for email-or-phone Supabase Auth accounts.
-- Apply before releasing the OTP-enabled mobile app.
alter table public.profiles
  add column if not exists email_verified boolean not null default false,
  add column if not exists mobile_verified boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- Backfill only from Auth's authoritative confirmation timestamps.
update public.profiles p
set email = coalesce(p.email, u.email),
    phone = coalesce(p.phone, u.phone),
    email_verified = coalesce(p.email_verified, false) or u.email_confirmed_at is not null,
    mobile_verified = coalesce(p.mobile_verified, false) or u.phone_confirmed_at is not null,
    updated_at = now()
from auth.users u
where u.id = p.id;

create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();
