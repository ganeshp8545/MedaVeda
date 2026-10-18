-- Forward repair: never report success for an attached upload whose note was deleted.
begin;
create or replace function public.save_note_with_upload(
  p_request_id uuid, p_note_id text, p_title text, p_description text,
  p_chapter_id text, p_order integer, p_active boolean, p_is_free_preview boolean
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_upload public.note_upload_requests%rowtype;
  v_payload jsonb;
  v_note_id text;
begin
  if not public.am_i_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_request_id is null or p_title is null or length(btrim(p_title)) not between 1 and 200
     or p_description is null or length(p_description) > 2000
     or p_chapter_id is null or p_order is null or p_order < 1
     or p_active is null or p_is_free_preview is null then
    raise exception 'Invalid note data' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('note_id',p_note_id,'title',btrim(p_title),
    'description',p_description,'chapter_id',p_chapter_id,'order',p_order,
    'active',p_active,'is_free_preview',p_is_free_preview);
  select * into v_upload from public.note_upload_requests
    where request_id = p_request_id for update;
  if not found or v_upload.admin_user_id <> auth.uid() then
    raise exception 'Upload request unavailable' using errcode = '42501';
  end if;
  if v_upload.status = 'attached' then
    if v_upload.save_payload is distinct from v_payload then
      raise exception 'Upload request already used for another note change' using errcode = '23505';
    end if;
    if v_upload.note_id is null or not exists (
      select 1 from public.notes where id = v_upload.note_id
    ) then
      raise exception 'Previously saved note was deleted; start a new upload request' using errcode = '22023';
    end if;
    return v_upload.note_id;
  end if;
  if v_upload.status <> 'uploaded' then
    raise exception 'PDF upload is incomplete' using errcode = '22023';
  end if;
  if p_note_id is null then
    insert into public.notes(title,description,pdf_url,chapter_id,"order",active,is_free_preview)
    values(btrim(p_title),p_description,v_upload.pdf_url,p_chapter_id,p_order,p_active,p_is_free_preview)
    returning id into v_note_id;
  else
    update public.notes set title=btrim(p_title),description=p_description,
      pdf_url=v_upload.pdf_url,chapter_id=p_chapter_id,"order"=p_order,
      active=p_active,is_free_preview=p_is_free_preview
    where id=p_note_id returning id into v_note_id;
    if v_note_id is null then
      raise exception 'Note unavailable' using errcode = '22023';
    end if;
  end if;
  update public.note_upload_requests set status='attached',note_id=v_note_id,
    save_payload=v_payload,updated_at=now() where request_id=p_request_id;
  return v_note_id;
end $$;
revoke all on function public.save_note_with_upload(uuid,text,text,text,text,integer,boolean,boolean) from public,anon;
grant execute on function public.save_note_with_upload(uuid,text,text,text,text,integer,boolean,boolean) to authenticated;

commit;
