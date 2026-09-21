-- ============================================================================
-- F7: retire the legacy e-mail based admin check.
--
-- public.is_admin() decided "admin" from the e-mail claim inside the JWT and had no
-- pinned search_path; public.am_i_admin() decides from admins.id = auth.uid() and is
-- pinned. Every legacy policy had an am_i_admin() twin EXCEPT app_settings UPDATE, so
-- that twin is created FIRST (otherwise the admin panel could no longer save settings).
-- Then the 14 legacy policies, the inline-e-mail policy on notes and the function go.
--
-- Checked before writing: no function body and no app / admin-panel / edge-function
-- code calls is_admin(); all 3 rows in admins have an id that matches their auth e-mail,
-- so nobody who is an admin today depends on the e-mail path.
-- What changes for behaviour: a signed-in user whose JWT e-mail merely EQUALS an admin's
-- e-mail (but whose id is not in admins) is no longer treated as an admin anywhere.
-- ============================================================================

-- 1. the missing twin, same rule as the legacy policy but by admin id
drop policy if exists app_settings_admin_update on public.app_settings;
create policy app_settings_admin_update on public.app_settings
  for update using (public.am_i_admin()) with check (public.am_i_admin());

-- 2. the legacy policies (each has an am_i_admin() twin: *_admin_write / *_select_own_or_admin / ...)
drop policy if exists "admin write app_settings"        on public.app_settings;
drop policy if exists "admin write chapters"            on public.chapters;
drop policy if exists "admin write notifications"       on public.notifications;
drop policy if exists "public read active notifications" on public.notifications;   -- twin notifications_public_read_active is broader (anon too)
drop policy if exists "user read own orders"            on public.orders;
drop policy if exists "admin write products"            on public.products;
drop policy if exists "admin manage profiles"           on public.profiles;
drop policy if exists "user read own profile"           on public.profiles;
drop policy if exists "user read own purchases"         on public.purchases;
drop policy if exists "user read own quiz_scores"       on public.quiz_scores;
drop policy if exists "admin write quiz_tests"          on public.quiz_tests;
drop policy if exists "admin write subjects"            on public.subjects;
drop policy if exists "admin write videos"              on public.videos;
drop policy if exists "admin write years"               on public.years;
drop policy if exists "Admin can manage notes"          on public.notes;               -- inline admins.email check; twin notes_admin_write

-- 3. drop the function only if nothing still depends on it
do $$
declare v_left text;
begin
  select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into v_left
    from pg_policies
   where schemaname in ('public', 'storage')
     and coalesce(qual, '') || coalesce(with_check, '') ~ 'is_admin\(\)';
  if v_left is not null then
    raise exception 'F7 REFUSED: policies still use is_admin(): %. Give each an am_i_admin() twin, drop it, re-run.', v_left;
  end if;
end $$;

drop function if exists public.is_admin();
