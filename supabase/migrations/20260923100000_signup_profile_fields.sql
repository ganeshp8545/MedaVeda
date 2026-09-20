-- Signup now keeps the student's name and mobile number.
--
-- Problem: the app sends { full_name, mobile_number } in signup metadata, but
-- the live handle_new_user() only reads 'name' and never sets profiles.phone.
-- New accounts therefore had a blank name and no phone, so login by mobile
-- number (which looks up profiles.phone_normalized) could never find them.
--
-- Fix: read full_name (falling back to name) and mobile_number. The existing
-- profiles_sync_phone_normalized trigger fills phone_normalized, and the
-- existing unique index profiles_phone_normalized_unique rejects a number that
-- is already registered. A malformed number is ignored rather than failing the
-- whole signup (the app validates it before sending).
--
-- Apply AFTER 20260922100000 (Phase 1A). Existing accounts are NOT changed:
-- those that have no phone stored can still sign in with email.
-- Rollback: re-create the previous body (insert id, name, email only).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name  text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
                           nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
                           '');
  v_phone text := public.normalize_phone(new.raw_user_meta_data ->> 'mobile_number');
begin
  insert into public.profiles (id, name, email, phone)
  values (new.id, v_name, new.email, v_phone)
  on conflict (id) do nothing;
  return new;
end;
$$;
