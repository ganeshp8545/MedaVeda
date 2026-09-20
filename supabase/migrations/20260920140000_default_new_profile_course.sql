-- ============================================================================
-- TEMPORARY – remove with the NULL-year fallback
-- ============================================================================
-- Until the new mobile build is live, signups from OLD app versions create a
-- profile with course_id NULL (the old app has no course picker), so they see
-- no content even with the NULL-year fallback (20260920120000).
--
-- Fix: when a profile is INSERTED with course_id NULL, default it to 'bams',
-- the only course the old app served. A profile inserted with any other
-- course (e.g. 'bhms') is left alone, and UPDATEs are never touched, so
-- set_my_course_year() and admin edits behave exactly as before.
--
-- Side effect on the NEW app: a fresh signup arrives at the course/year
-- picker with BAMS preselected (like a backfilled student) instead of empty.
-- It still has to choose a year, and can change the course there.
--
-- Separate trigger; profiles_before_write() is not modified.
-- Removal steps: docs/multi-course-changes.md ("Removing the NULL-year fallback").
-- ============================================================================
create or replace function public.profiles_temp_default_course()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.course_id is null
     and exists (select 1 from public.courses where id = 'bams') then
    new.course_id := 'bams';   -- TEMPORARY – remove with the NULL-year fallback
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_temp_default_course on public.profiles;
create trigger profiles_temp_default_course
  before insert on public.profiles
  for each row execute function public.profiles_temp_default_course();
