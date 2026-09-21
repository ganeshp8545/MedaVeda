-- ============================================================================
-- LOW-priority audit fix (S7): table privileges nothing needs.
--
-- RLS is the only row-level barrier, and the admin panel is an `authenticated` session (same DB
-- role as students), so tables the admin panel edits keep their grants. What is removed here are
-- privileges NO client uses (checked against the admin panel, the mobile app and the released
-- build's write paths): those tables are written only by SECURITY DEFINER functions or the
-- service role, so a future policy mistake there can no longer become a client write.
--
--   authenticated: admins (all writes), referrals (all writes), analytics_events UPDATE/DELETE, profiles INSERT/DELETE (rows are created by the
--                  signup trigger and removed by erase_user_data), referral_settings INSERT/DELETE
--                  (a single row that is only ever updated).
--   anon:          SELECT on everything except the four tables the app reads before login.
--
-- KEPT on purpose: notifications writes (admin RLS policy exists for the admin panel), quiz_scores UPDATE (the offline sync engine writes with upsert), push_tokens
-- INSERT/UPDATE (released builds upsert directly), analytics_events INSERT for anon.
-- ============================================================================

revoke insert, update, delete on public.admins        from authenticated;
revoke insert, update, delete on public.referrals     from authenticated;
revoke update, delete         on public.analytics_events from authenticated;
revoke insert, delete         on public.profiles       from authenticated;
revoke insert, delete         on public.referral_settings from authenticated;

do $$
declare r record;
begin
  for r in
    select c.oid::regclass as tbl
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and c.relname not in ('courses', 'years', 'notifications', 'app_config')
      and has_table_privilege('anon', c.oid, 'select')
  loop
    execute format('revoke select on %s from anon', r.tbl);
  end loop;
end $$;

-- The notes storage policy applied to the public role, so its `notes` sub-select ran as anon, which
-- no longer has SELECT on that table ("permission denied" instead of "no rows", which would also
-- break anonymous listing of the public thumbnails bucket). Anonymous users never own a purchase,
-- so the policy is simply limited to signed-in users; the result for everyone is unchanged.
drop policy if exists notes_read_if_purchased on storage.objects;
create policy notes_read_if_purchased on storage.objects
  for select to authenticated
  using (
    bucket_id = 'notes'
    and (
      public.am_i_admin()
      or exists (
        select 1
        from public.notes n
        where n.active
          and (n.pdf_url = objects.name
               or right(n.pdf_url, length(objects.name) + 1) = '/' || objects.name)
          and public.user_owns_chapter(n.chapter_id)
      )
    )
  );
