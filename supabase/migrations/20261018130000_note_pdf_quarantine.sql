-- Large PDFs bypass Edge body buffering, but never bypass trusted validation.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('note-quarantine','note-quarantine',false,52428800,array['application/pdf'])
on conflict(id) do nothing;
do $$ begin
  if not exists(select 1 from storage.buckets where id='note-quarantine'
    and not public and file_size_limit=52428800
    and allowed_mime_types=array['application/pdf']::text[]) then
    raise exception 'Existing quarantine bucket settings differ; review before deployment';
  end if;
end $$;
-- No client can read/write quarantine through ordinary Storage APIs. Signed
-- upload capability is issued only after authenticated admin authorization.
create policy note_quarantine_private on storage.objects as restrictive
  for all to public using(bucket_id <> 'note-quarantine') with check(bucket_id <> 'note-quarantine');
create table public.note_pdf_validation_jobs (
  request_id uuid primary key references public.note_upload_requests(request_id),
  expected_bytes bigint not null check(expected_bytes between 1 and 52428800),
  status text not null default 'pending' check(status in ('pending','working','complete','rejected')),
  lease_id uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.note_pdf_validation_jobs enable row level security;
revoke all on public.note_pdf_validation_jobs from public,anon,authenticated;
grant all on public.note_pdf_validation_jobs to service_role;
create index note_pdf_validation_jobs_pending_idx on public.note_pdf_validation_jobs(updated_at)
  where status in ('pending','working');

create function public.reserve_note_pdf_validation(p_request_id uuid,p_admin uuid,p_hash text,p_bytes bigint,p_url text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u public.note_upload_requests%rowtype; v_path text;
begin
  v_path := 'validated/' || p_admin || '/' || p_request_id || '.pdf';
  insert into public.note_upload_requests(request_id,admin_user_id,sha256,object_path,pdf_url)
    values(p_request_id,p_admin,p_hash,v_path,p_url) on conflict(request_id) do nothing;
  select * into u from public.note_upload_requests where request_id=p_request_id for update;
  if u.admin_user_id<>p_admin or u.sha256<>p_hash or u.object_path<>v_path or u.pdf_url<>p_url then
    raise exception 'Request ID already used' using errcode='23505';
  end if;
  insert into public.note_pdf_validation_jobs(request_id,expected_bytes)
    values(p_request_id,p_bytes) on conflict(request_id) do nothing;
  if (select expected_bytes from public.note_pdf_validation_jobs where request_id=p_request_id)<>p_bytes then
    raise exception 'Request size changed' using errcode='23505';
  end if;
  -- Explicit same-file admin retry rearms exhausted transient failures only.
  update public.note_pdf_validation_jobs set status='pending',attempts=0,
    lease_id=null,lease_until=null,last_error=null,updated_at=now()
    where request_id=p_request_id and attempts>=5 and
      (status='pending' or (status='working' and lease_until<now()));
end $$;

create function public.claim_note_pdf_validation()
returns table(request_id uuid,lease_id uuid,expected_bytes bigint,sha256 text,object_path text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_lease uuid := gen_random_uuid();
begin
  select j.request_id into v_id from public.note_pdf_validation_jobs j
    where (j.status='pending' or (j.status='working' and j.lease_until<now()))
    and j.updated_at <= now() and j.attempts<5
    order by j.updated_at for update skip locked limit 1;
  if v_id is null then return; end if;
  update public.note_pdf_validation_jobs j set status='working',lease_id=v_lease,
    lease_until=now()+interval '10 minutes',attempts=attempts+1,updated_at=now() where j.request_id=v_id;
  return query select u.request_id,v_lease,j.expected_bytes,u.sha256,u.object_path
    from public.note_upload_requests u join public.note_pdf_validation_jobs j using(request_id)
    where u.request_id=v_id;
end $$;

create function public.finish_note_pdf_validation(p_request_id uuid,p_lease uuid,p_outcome text,p_error text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_outcome not in ('complete','rejected','pending') or p_outcome is null then
    raise exception 'Invalid validation outcome' using errcode='22023';
  end if;
  perform 1 from public.note_pdf_validation_jobs where request_id=p_request_id
    and status='working' and lease_id=p_lease and lease_until>now() for update;
  if not found then return false; end if;
  if p_outcome='complete' then
    update public.note_upload_requests set status='uploaded',updated_at=now()
      where request_id=p_request_id and status='reserved';
  end if;
  update public.note_pdf_validation_jobs set status=p_outcome,lease_until=null,lease_id=null,
    last_error=left(p_error,300),updated_at=now()+case when p_outcome='pending' then interval '1 minute' else interval '0' end
    where request_id=p_request_id;
  return true;
end $$;
revoke all on function public.reserve_note_pdf_validation(uuid,uuid,text,bigint,text) from public,anon,authenticated;
revoke all on function public.claim_note_pdf_validation() from public,anon,authenticated;
revoke all on function public.finish_note_pdf_validation(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_note_pdf_validation(uuid,uuid,text,bigint,text) to service_role;
grant execute on function public.claim_note_pdf_validation() to service_role;
grant execute on function public.finish_note_pdf_validation(uuid,uuid,text,text) to service_role;
commit;
