-- Read-only: run against the confirmed existing project as an authorized operator.
-- This is an inventory, not a cleanup job. Never delete objects from this output alone.
begin transaction read only;

with note_paths as (
  select n.id, n.pdf_url,
    case
      when position('/object/public/notes/' in split_part(n.pdf_url, '?', 1)) > 0
        then split_part(split_part(n.pdf_url, '?', 1), '/object/public/notes/', 2)
      else split_part(n.pdf_url, '?', 1)
    end as object_path
  from public.notes n
), references_by_upload as (
  select u.request_id,
    count(distinct n.id) as referencing_note_count,
    string_agg(distinct n.id, ', ' order by n.id) as referencing_note_ids
  from public.note_upload_requests u
  left join note_paths n on n.id = u.note_id
    or n.pdf_url = u.pdf_url
    or n.object_path = u.object_path
  group by u.request_id
)
select u.request_id, u.status, u.created_at, u.updated_at, u.note_id,
  j.status as validation_status,j.attempts,j.lease_until,j.last_error,
  (q.id is not null) as quarantined_object_exists,
  u.object_path, coalesce(r.referencing_note_count, 0) as referencing_note_count,
  r.referencing_note_ids, (o.id is not null) as object_exists,
  case
    when coalesce(r.referencing_note_count, 0) > 0 then 'REFERENCED_KEEP'
    when u.status = 'attached' then 'ATTACHED_WITHOUT_CURRENT_REFERENCE_REVIEW'
    when o.id is not null then 'UNATTACHED_OBJECT_REVIEW'
    else 'NO_OBJECT_REVIEW'
  end as review_class
from public.note_upload_requests u
left join references_by_upload r using (request_id)
left join public.note_pdf_validation_jobs j on j.request_id=u.request_id
left join storage.objects q on q.bucket_id='note-quarantine' and q.name=u.object_path
left join storage.objects o on o.bucket_id = 'notes' and o.name = u.object_path
order by u.created_at, u.request_id;

commit;
