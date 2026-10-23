-- Preserve existing jobs, Admin prices and entitlements. Apply only after review.
begin;

create or replace function public.queue_play_price_sync(p_price numeric)
returns void language plpgsql security definer set search_path=public as $$
declare v_sku text;
begin
  if p_price is null or p_price <= 0 then return; end if;
  select play_sku into v_sku from public.play_price_tiers
    where price_inr=p_price and active order by created_at desc limit 1;
  if v_sku is null then
    v_sku := 'notes_' || replace(p_price::numeric(10,2)::text, '.', '_') || '_v_' || replace(gen_random_uuid()::text, '-', '');
  end if;
  -- Product/PDF edits only ensure that a job exists. They must not revoke an
  -- active lease, bypass backoff, or retry a terminal authorization failure.
  -- Existing ready tiers are rechecked by requeue_stale_play_price_sync;
  -- failed jobs require the explicit, admin-authorized retry RPC.
  insert into public.play_price_sync(price_inr,candidate_sku)
    values(p_price,v_sku) on conflict(price_inr) do nothing;
  if found then
    insert into public.play_price_sync_logs(price_inr,play_sku,event)
      values(p_price,v_sku,'queued');
  end if;
end; $$;
revoke all on function public.queue_play_price_sync(numeric) from public,anon,authenticated;

create or replace function public.fail_play_price_sync(p_price numeric,p_lease uuid,p_reason text,p_retry boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_sku text; v_attempts integer;
begin
  select candidate_sku,attempts into v_sku,v_attempts from public.play_price_sync
    where price_inr=p_price and lease_id=p_lease and status='running' and lease_until>now() for update;
  if not found then return false; end if;
  update public.play_price_sync set status=case when p_retry and v_attempts<12 then 'pending' else 'failed' end,
    next_attempt_at=now()+make_interval(secs=>least(3600,15*power(2,least(v_attempts,8)))::integer),
    lease_id=null,lease_until=null,last_error=left(p_reason,300),updated_at=now() where price_inr=p_price;
  insert into public.play_price_sync_logs(price_inr,play_sku,event,detail)
    values(p_price,v_sku,case when p_retry and v_attempts<12 then 'retry' else 'failed' end,left(p_reason,300));
  return true;
end; $$;
revoke all on function public.fail_play_price_sync(numeric,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.fail_play_price_sync(numeric,uuid,text,boolean) to service_role;
commit;
