-- ============================================================================
-- HIGH 5 support — rate limiting for login-with-mobile / request-password-reset-by-mobile
-- ============================================================================
-- Fixed-window counters kept in Postgres so the limit holds across Edge Function
-- instances. Keys are SHA-256 hashes computed by the function (never raw phone
-- numbers or IPs). Only service_role can call the RPC or touch the table.
begin;

create table if not exists public.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;   -- no policies: service_role only
revoke all on public.rate_limits from public, anon, authenticated;

-- Returns true when the caller is WITHIN the limit (and records the hit),
-- false when the limit is exceeded.
create or replace function public.rate_limit_hit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  if p_key is null or p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'invalid rate limit parameters';
  end if;

  insert into public.rate_limits (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  -- opportunistic cleanup of old windows (cheap; keeps the table tiny)
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

commit;
