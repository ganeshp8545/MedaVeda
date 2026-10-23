-- SEC-02: students obtain paid and free-preview URLs only via get-note-url,
-- which calls user_can_access_note (including the blocked-account check).
-- Admin preview SELECT policies remain in place. Service-role signing bypasses RLS.
begin;
drop policy if exists notes_read_if_purchased on storage.objects;
-- Restrictive policy also prevents another permissive SELECT/ALL policy from
-- accidentally reopening the notes bucket to students.
drop policy if exists notes_service_reads_only on storage.objects;
create policy notes_service_reads_only on storage.objects as restrictive
  for select to public
  using (bucket_id <> 'notes' or public.am_i_admin());
commit;

-- Rollback: prefer a forward correction. To undo, drop notes_service_reads_only
-- and recreate notes_read_if_purchased from 20260930110000_low_grants_tightening.sql.
-- WARNING: that restores the blocked-account bypass; do not use as a routine rollback.
-- Existing signed URLs remain usable until their existing expiry.
