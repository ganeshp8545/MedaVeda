-- Review before applying. No product prices or existing purchase records are changed.
begin;

-- A price can have several historical SKUs. Orders retain the SKU they bought.
alter table public.play_price_tiers drop constraint if exists play_price_tiers_pkey;
alter table public.play_price_tiers add primary key (play_sku);
alter table public.play_price_tiers add column if not exists purchase_option_id text;
alter table public.play_price_tiers add column if not exists currency_code text not null default 'INR';
alter table public.play_price_tiers add column if not exists region_code text not null default 'IN';
alter table public.play_price_tiers add column if not exists verified_at timestamptz;
alter table public.play_price_tiers drop constraint if exists play_price_tiers_play_sku_check;
create unique index if not exists play_one_active_verified_tier_per_price
  on public.play_price_tiers (price_inr) where active and verified_at is not null;
-- The existing (kind, order_id) primary key cannot serve order_id-only
-- lookups or the foreign-key check when an order is removed.
create index if not exists play_payment_jobs_order_id_idx
  on public.play_payment_jobs (order_id);

create table public.play_price_sync (
  price_inr numeric(10,2) primary key check (price_inr > 0),
  status text not null default 'pending' check (status in ('pending','running','ready','failed')),
  candidate_sku text not null unique,
  purchase_option_id text not null default 'buy',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  last_error text,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);
create table public.play_price_sync_logs (
  id bigint generated always as identity primary key,
  price_inr numeric(10,2) not null,
  play_sku text not null,
  event text not null check (event in ('queued','claimed','verified','retry','failed','rotated')),
  detail text,
  created_at timestamptz not null default now()
);
create index play_price_sync_due on public.play_price_sync(next_attempt_at) where status in ('pending','running');
create index play_price_sync_logs_price on public.play_price_sync_logs(price_inr, created_at desc);
alter table public.play_price_sync enable row level security;
alter table public.play_price_sync_logs enable row level security;
revoke all on public.play_price_sync, public.play_price_sync_logs from public, anon, authenticated;
grant all on public.play_price_sync, public.play_price_sync_logs to service_role;
grant usage, select on sequence public.play_price_sync_logs_id_seq to service_role;

-- A Play product sells paid PDFs only. Scope links to notes through chapters;
-- videos have no product relationship. An explicit Admin classification is
-- required, including for legacy rows whose default product_type is 'other'.
create or replace function public.play_notes_product_eligible(p public.products)
returns boolean language sql stable security definer set search_path=public as $$
  select p.active and p.price > 0 and p.course_id is not null
    and ((p.scope in ('chapter','subject','year') and p.product_type='notes')
      or (p.scope='bundle' and p.product_type='notes_bundle'
        and cardinality(p.year_ids) between 2 and 3))
    and exists (
      select 1 from public.notes n join public.chapters c on c.id=n.chapter_id
        join public.subjects s on s.id=c.subject_id join public.years y on y.id=s.year_id
      where n.active and not n.is_free_preview and nullif(btrim(n.pdf_url),'') is not null
        and c.active and s.active and y.active
        and c.course_id=p.course_id and s.course_id=p.course_id and y.course_id=p.course_id
        and ((p.scope='chapter' and c.id=p.chapter_id)
          or (p.scope='subject' and c.subject_id=p.subject_id)
          or (p.scope='year' and c.year_id=p.year_id)
          or (p.scope='bundle' and c.year_id=any(p.year_ids)))
    )
    and (p.scope<>'bundle' or (
      select count(distinct c.year_id) from public.notes n
        join public.chapters c on c.id=n.chapter_id
        join public.subjects s on s.id=c.subject_id join public.years y on y.id=s.year_id
      where n.active and not n.is_free_preview and nullif(btrim(n.pdf_url),'') is not null
        and c.active and s.active and y.active
        and c.course_id=p.course_id and s.course_id=p.course_id and y.course_id=p.course_id
        and c.year_id=any(p.year_ids)
    )=cardinality(p.year_ids));
$$;
revoke all on function public.play_notes_product_eligible(public.products) from public,anon,authenticated;
grant execute on function public.play_notes_product_eligible(public.products) to service_role,authenticated;

create or replace function public.play_price_has_eligible_product(p_price numeric)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.products p where p.price=p_price
    and public.play_notes_product_eligible(p));
$$;
revoke all on function public.play_price_has_eligible_product(numeric) from public,anon,authenticated;
grant execute on function public.play_price_has_eligible_product(numeric) to service_role;

-- Legacy 'other' rows remain unchanged and are excluded by the eligibility
-- helper. Owner classification can happen after this migration is deployed.

create or replace function public.queue_play_price_sync(p_price numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_sku text;
begin
  if p_price is null or p_price <= 0 then return; end if;
  select play_sku into v_sku from public.play_price_tiers
    where price_inr = p_price and active order by created_at desc limit 1;
  if v_sku is null then
    v_sku := 'notes_' || replace(p_price::numeric(10,2)::text, '.', '_') || '_v_' || replace(gen_random_uuid()::text, '-', '');
  end if;
  insert into public.play_price_sync(price_inr, candidate_sku)
    values (p_price, v_sku)
    on conflict(price_inr) do update set
      status = case when public.play_price_sync.status = 'ready' then 'ready' else 'pending' end,
      next_attempt_at = case when public.play_price_sync.status = 'ready' then public.play_price_sync.next_attempt_at else now() end,
      updated_at = now();
  insert into public.play_price_sync_logs(price_inr, play_sku, event)
    values(p_price, v_sku, 'queued');
end; $$;
revoke all on function public.queue_play_price_sync(numeric) from public, anon, authenticated;
-- This trigger does not change products.active or products.price.
create or replace function public.queue_product_play_price()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if public.play_notes_product_eligible(new) then perform public.queue_play_price_sync(new.price); end if;
  elsif public.play_notes_product_eligible(new) and
      (new.price is distinct from old.price or new.active is distinct from old.active
       or new.product_type is distinct from old.product_type or new.scope is distinct from old.scope
       or new.chapter_id is distinct from old.chapter_id or new.subject_id is distinct from old.subject_id
       or new.year_id is distinct from old.year_id or new.year_ids is distinct from old.year_ids) then
    perform public.queue_play_price_sync(new.price);
  end if;
  return new;
end; $$;
revoke all on function public.queue_product_play_price() from public, anon, authenticated;
create trigger products_queue_play_price after insert or update of price, active, product_type, scope,
  chapter_id, subject_id, year_id, year_ids on public.products
  for each row execute function public.queue_product_play_price();

-- A product may be classified before its first paid PDF is published.
create or replace function public.queue_notes_play_price()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.active and not new.is_free_preview then
    perform public.queue_play_price_sync(p.price)
      from public.products p join public.chapters c on c.id=new.chapter_id
      where public.play_notes_product_eligible(p) and c.course_id=p.course_id
        and ((p.scope='chapter' and p.chapter_id=c.id)
          or (p.scope='subject' and p.subject_id=c.subject_id)
          or (p.scope='year' and p.year_id=c.year_id)
          or (p.scope='bundle' and c.year_id=any(p.year_ids)));
  end if;
  return new;
end; $$;
revoke all on function public.queue_notes_play_price() from public,anon,authenticated;
create trigger notes_queue_play_price after insert or update of active,is_free_preview,chapter_id,pdf_url on public.notes
  for each row execute function public.queue_notes_play_price();

-- Only authenticated admins can request a safe recheck; no browser gets service credentials.
create or replace function public.retry_play_price_sync(p_price numeric)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.am_i_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if not exists(select 1 from public.products p where p.price=p_price
    and public.play_notes_product_eligible(p)) then return false; end if;
  update public.play_price_sync set status='pending', next_attempt_at=now(), last_error=null, updated_at=now()
    where price_inr=p_price and (lease_until is null or lease_until < now());
  if not found then return false; end if;
  insert into public.play_price_sync_logs(price_inr,play_sku,event,detail)
    select price_inr,candidate_sku,'queued','admin retry' from public.play_price_sync where price_inr=p_price;
  return true;
end; $$;
revoke all on function public.retry_play_price_sync(numeric) from public,anon,authenticated;
grant execute on function public.retry_play_price_sync(numeric) to authenticated;

create or replace function public.claim_play_price_sync()
returns table(price_inr numeric, candidate_sku text, purchase_option_id text, lease_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_row public.play_price_sync%rowtype; v_lease uuid := gen_random_uuid();
begin
  select * into v_row from public.play_price_sync s
    where ((s.status = 'pending' and s.next_attempt_at <= now())
       or (s.status='running' and s.lease_until < now()))
    and exists(select 1 from public.products p where p.price=s.price_inr
      and public.play_notes_product_eligible(p))
    order by s.next_attempt_at, s.price_inr for update skip locked limit 1;
  if not found then return; end if;
  update public.play_price_sync s set status='running', lease_id=v_lease,
    lease_until=now()+interval '3 minutes', attempts=s.attempts+1, updated_at=now()
    where s.price_inr=v_row.price_inr;
  insert into public.play_price_sync_logs(price_inr,play_sku,event)
    values(v_row.price_inr,v_row.candidate_sku,'claimed');
  price_inr:=v_row.price_inr; candidate_sku:=v_row.candidate_sku;
  purchase_option_id:=v_row.purchase_option_id; lease_id:=v_lease;
  return next;
end; $$;
revoke all on function public.claim_play_price_sync() from public,anon,authenticated;
grant execute on function public.claim_play_price_sync() to service_role;

create or replace function public.requeue_stale_play_price_sync()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  update public.play_price_sync s set status='pending',next_attempt_at=now(),updated_at=now()
    where s.status='ready' and s.last_synced_at < now()-interval '24 hours'
      and exists(select 1 from public.products p where p.price=s.price_inr
        and public.play_notes_product_eligible(p));
  get diagnostics v_count = row_count;
  return v_count;
end; $$;
revoke all on function public.requeue_stale_play_price_sync() from public,anon,authenticated;
grant execute on function public.requeue_stale_play_price_sync() to service_role;

-- A reused or externally modified SKU is never repriced. Reserve a fresh version.
create or replace function public.rotate_play_price_sku(p_price numeric,p_lease uuid,p_reason text)
returns text language plpgsql security definer set search_path=public as $$
declare v_new text;
begin
  v_new := 'notes_' || replace(p_price::numeric(10,2)::text, '.', '_') || '_v_' || replace(gen_random_uuid()::text, '-', '');
  update public.play_price_sync set candidate_sku=v_new, updated_at=now()
    where price_inr=p_price and lease_id=p_lease and status='running' and lease_until>now();
  if not found then raise exception 'Play sync lease lost'; end if;
  update public.play_price_tiers set active=false where price_inr=p_price and active;
  insert into public.play_price_sync_logs(price_inr,play_sku,event,detail)
    values(p_price,v_new,'rotated',left(p_reason,200));
  return v_new;
end; $$;
revoke all on function public.rotate_play_price_sku(numeric,uuid,text) from public,anon,authenticated;
grant execute on function public.rotate_play_price_sku(numeric,uuid,text) to service_role;

create or replace function public.finish_play_price_sync(p_price numeric,p_lease uuid,p_sku text,p_option text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.play_price_sync where price_inr=p_price and lease_id=p_lease
    and candidate_sku=p_sku and purchase_option_id=p_option and status='running' and lease_until>now() for update;
  if not found then return false; end if;
  if not exists(select 1 from public.products p where p.price=p_price
    and public.play_notes_product_eligible(p)) then return false; end if;
  update public.play_price_tiers set active=false where price_inr=p_price and play_sku<>p_sku and active;
  insert into public.play_price_tiers(price_inr,play_sku,active,purchase_option_id,currency_code,region_code,verified_at)
    values(p_price,p_sku,true,p_option,'INR','IN',now())
    on conflict(play_sku) do update set active=true,purchase_option_id=excluded.purchase_option_id,
      currency_code='INR',region_code='IN',verified_at=now();
  update public.play_price_sync set status='ready',lease_id=null,lease_until=null,last_error=null,
    last_synced_at=now(),updated_at=now() where price_inr=p_price;
  insert into public.play_price_sync_logs(price_inr,play_sku,event) values(p_price,p_sku,'verified');
  return true;
end; $$;
revoke all on function public.finish_play_price_sync(numeric,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_play_price_sync(numeric,uuid,text,text) to service_role;

create or replace function public.fail_play_price_sync(p_price numeric,p_lease uuid,p_reason text,p_retry boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_sku text; v_attempts integer;
begin
  select candidate_sku,attempts into v_sku,v_attempts from public.play_price_sync
    where price_inr=p_price and lease_id=p_lease and status='running' for update;
  if not found then return false; end if;
  update public.play_price_sync set status=case when p_retry and v_attempts<12 then 'pending' else 'failed' end,
    next_attempt_at=now()+make_interval(secs=>least(3600, 15 * power(2,least(v_attempts,8)))::integer),
    lease_id=null,lease_until=null,last_error=left(p_reason,300),updated_at=now() where price_inr=p_price;
  insert into public.play_price_sync_logs(price_inr,play_sku,event,detail)
    values(p_price,v_sku,case when p_retry and v_attempts<12 then 'retry' else 'failed' end,left(p_reason,300));
  return true;
end; $$;
revoke all on function public.fail_play_price_sync(numeric,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.fail_play_price_sync(numeric,uuid,text,boolean) to service_role;

-- Admin status is a read-only view. It never exposes credentials or purchase tokens.
create view public.admin_play_billing_status with (security_invoker=true) as
select p.id as product_id,p.title,p.price,p.active as catalog_active,
  case when not p.active then 'catalog_inactive'
       when not public.play_notes_product_eligible(p) then 'not_billable_notes'
       when p.price <= 0 then 'unsupported_price'
       when t.verified_at > now()-interval '24 hours' and t.active and s.status='ready' then 'ready'
       when s.status='ready' then 'stale'
       else coalesce(s.status,'pending') end as billing_status,
  t.play_sku,t.purchase_option_id,t.price_inr as synced_price,t.currency_code,
  s.last_synced_at,s.last_error,s.attempts
from public.products p
left join public.play_price_sync s on s.price_inr=p.price
left join public.play_price_tiers t on t.play_sku=s.candidate_sku and t.active and t.verified_at is not null
where public.am_i_admin();
revoke all on public.admin_play_billing_status from public,anon,authenticated;
grant select on public.admin_play_billing_status to authenticated;
-- The invoker still needs RLS access to the underlying restricted tier tables.
create policy admin_read_play_tiers on public.play_price_tiers for select to authenticated using (public.am_i_admin());
create policy admin_read_play_sync on public.play_price_sync for select to authenticated using (public.am_i_admin());
grant select on public.play_price_tiers,public.play_price_sync to authenticated;

-- Backfill by price only; all Admin product values remain byte-for-byte unchanged.
select public.queue_play_price_sync(price) from (
  select distinct p.price from public.products p where public.play_notes_product_eligible(p)
) eligible;

-- Override the order gate with a verified tier and snapshot its BUY option.
alter table public.orders add column if not exists play_purchase_option_id text;
create or replace function public.orders_play_option_immutable()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.play_purchase_option_id is distinct from old.play_purchase_option_id then
    raise exception 'orders.play_purchase_option_id is immutable' using errcode='42501';
  end if;
  return new;
end; $$;
revoke all on function public.orders_play_option_immutable() from public,anon,authenticated;
create trigger orders_play_option_immutable before update on public.orders
  for each row execute function public.orders_play_option_immutable();
create or replace function public.create_play_order(p_user_id uuid, p_product_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_product public.products%rowtype; v_profile public.profiles%rowtype;
  v_sku text; v_option text; v_order_id text := gen_random_uuid()::text; v_minutes integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_user_id::text, 0));
  select * into v_profile from public.profiles where id=p_user_id;
  if not found or v_profile.blocked then return jsonb_build_object('ok',false,'code','account_unavailable'); end if;
  select * into v_product from public.products where id=p_product_id and active;
  if not found or v_product.course_id is distinct from v_profile.course_id then return jsonb_build_object('ok',false,'code','product_unavailable'); end if;
  if not public.play_notes_product_eligible(v_product) then
    return jsonb_build_object('ok',false,'code','not_billable_notes');
  end if;
  if exists(select 1 from public.purchases where user_id=p_user_id and product_id=p_product_id and status='success') then return jsonb_build_object('ok',false,'code','already_owned'); end if;
  select t.play_sku,t.purchase_option_id into v_sku,v_option
    from public.play_price_tiers t join public.play_price_sync s on s.candidate_sku=t.play_sku
    where t.price_inr=v_product.price and t.active and t.verified_at > now()-interval '24 hours'
      and t.currency_code='INR' and t.region_code='IN' and s.status='ready';
  if v_sku is null then return jsonb_build_object('ok',false,'code','price_tier_pending'); end if;
  select checkout_expiry_minutes into v_minutes from public.referral_settings where id=true;
  update public.orders set status='cancelled',updated_at=now() where user_id=p_user_id and status='created' and provider='play' and purchase_token is null;
  insert into public.orders(id,user_id,product_id,scope,chapter_id,subject_id,year_id,year_ids,course_id,
    amount,list_price,provider,play_sku,play_purchase_option_id,status,expires_at)
  values(v_order_id,p_user_id,p_product_id,v_product.scope,v_product.chapter_id,v_product.subject_id,v_product.year_id,
    v_product.year_ids,v_product.course_id,v_product.price,v_product.price,'play',v_sku,v_option,'created',now()+make_interval(mins=>coalesce(v_minutes,30)));
  return jsonb_build_object('ok',true,'order_id',v_order_id,'play_sku',v_sku,'purchase_option_id',v_option);
end; $$;
revoke all on function public.create_play_order(uuid,text) from public,anon,authenticated;
grant execute on function public.create_play_order(uuid,text) to service_role;

commit;
