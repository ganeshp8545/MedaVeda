-- ============================================================================
-- HIGH-priority audit fixes (S2 phone enumeration / squatting, notes storage policy).
--
-- 1. profiles.phone can no longer be changed by a client with a plain UPDATE.
--    Before: any signed-in user could `update profiles set phone = '<someone else>'`.
--    The unique index then answered "registered / not registered" (enumeration), and
--    an unregistered number could be parked on an unverified account (squatting; the
--    phone login and password reset both trust profiles.phone_normalized).
--    Now the only client path is change_my_phone(): rate limited (5 changes or
--    attempts per user per 24 h), one generic failure for "taken", and the number is
--    marked unverified. Saving a profile with the phone UNCHANGED still works, so the
--    released app build (which sends `phone` on every Edit Profile save) keeps working.
--    Admins and server code (service_role, SECURITY DEFINER with the bypass flag) are unaffected.
--
-- 2. Storage policy notes_read_if_purchased matched objects with
--    POSITION(objects.name IN notes.pdf_url) > 0, i.e. ANY substring. It now requires
--    the object name to be the whole path (the end of pdf_url after '/', or pdf_url itself)
--    and the note to be active. Files are only ever read through get-note-url (signed URL,
--    service role); this policy is the direct-download backstop.
-- ============================================================================

create or replace function public.profiles_before_write()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_year_course_id text;
  v_client boolean := coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated');
  v_bypass boolean := coalesce(current_setting('app.allow_profile_admin_fields', true), 'false') = 'true';
  v_is_admin boolean := public.am_i_admin();
  v_protected text[] := array[
    'id', 'blocked', 'is_blocked', 'role', 'is_admin', 'is_staff', 'status',
    'email', 'email_verified', 'mobile_verified', 'referral_code', 'course_id', 'year_id',
    'created_at'
  ];
  v_old jsonb;
  v_new jsonb;
  v_col text;
begin
  if v_client and not v_bypass and not v_is_admin then
    if tg_op = 'UPDATE' then
      v_old := to_jsonb(old);
      v_new := to_jsonb(new);
      foreach v_col in array v_protected loop
        if v_new -> v_col is distinct from v_old -> v_col then
          raise exception 'Cannot modify protected profile field "%"', v_col
            using errcode = '42501';
        end if;
      end loop;
      -- The phone is only changeable through change_my_phone() (rate limited, generic
      -- errors). Compared normalised, so re-saving the same number is not a change.
      if public.normalize_phone(new.phone) is distinct from public.normalize_phone(old.phone)
         or new.phone_normalized is distinct from old.phone_normalized then
        raise exception 'Use change_my_phone() to change the phone number'
          using errcode = '42501';
      end if;
    else
      -- A client-created profile row starts unblocked and unverified.
      new.blocked := false;
      new.email_verified := false;
      new.mobile_verified := false;
    end if;
  end if;

  -- Self-heal: if year_id no longer belongs to course_id, clear it.
  if new.year_id is not null then
    select course_id into v_year_course_id from public.years where id = new.year_id;
    if v_year_course_id is null or v_year_course_id is distinct from new.course_id then
      new.year_id := null;
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.change_my_phone(p_phone text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_norm text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and coalesce(blocked, false)) then
    return jsonb_build_object('ok', false, 'code', 'unavailable');
  end if;

  -- Every call counts, successful or not: this is what bounds number probing.
  if not public.rate_limit_hit('phone-change:' || v_uid::text, 5, 86400) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  if p_phone is null or btrim(p_phone) = '' then
    v_norm := null;                       -- clearing the number is allowed
  else
    v_norm := public.normalize_phone(p_phone);
    if v_norm is null then
      return jsonb_build_object('ok', false, 'code', 'invalid');
    end if;
  end if;

  perform set_config('app.allow_profile_admin_fields', 'true', true);
  begin
    update public.profiles
       set phone = v_norm,
           mobile_verified = false,
           updated_at = now()
     where id = v_uid
       and phone_normalized is distinct from v_norm;
  exception when unique_violation then
    perform set_config('app.allow_profile_admin_fields', 'false', true);
    -- Same answer as any other refusal: does not reveal that the number is registered.
    return jsonb_build_object('ok', false, 'code', 'unavailable');
  end;
  perform set_config('app.allow_profile_admin_fields', 'false', true);

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.change_my_phone(text) from public, anon;
grant execute on function public.change_my_phone(text) to authenticated;

-- Storage: exact-path match, active notes only.
drop policy if exists notes_read_if_purchased on storage.objects;
create policy notes_read_if_purchased on storage.objects
  for select
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
