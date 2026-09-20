-- ============================================================================
-- TEMPORARY – remove after min app version X
-- ============================================================================
-- Old app builds (and every backfilled BAMS student) have profiles.course_id
-- set but profiles.year_id NULL until they update the app and pick a year.
-- Under the strict rule in 20260919120000 such a student sees NO free content.
--
-- Fallback: a student whose profile has course_id set but year_id NULL may see
-- all ACTIVE content of their OWN course. Nothing else changes:
--   * course isolation stays strict (pr.course_id must equal p_course_id;
--     a NULL course never matches),
--   * once year_id is set the strict course+year rule applies again,
--   * the purchase branch and the admin branch are unchanged,
--   * storage is untouched: PDFs are still gated by user_owns_chapter()
--     (purchase-based), exactly as for a student who has picked a year.
--
-- The whole change is the single line marked "TEMPORARY" below. To remove it,
-- see "Removing the NULL-year fallback" in docs/multi-course-changes.md.
-- ============================================================================
create or replace function public.has_content_access(p_course_id text, p_year_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.am_i_admin()
    or exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.course_id = p_course_id
        and (
          p_year_id is null
          or pr.year_id = p_year_id
          or pr.year_id is null   -- TEMPORARY – remove after min app version X
        )
    )
    or exists (
      select 1
      from public.purchases pu
      left join public.chapters ch on pu.scope = 'chapter' and ch.id = pu.chapter_id
      left join public.subjects sb on pu.scope = 'subject' and sb.id = pu.subject_id
      where pu.user_id = auth.uid()
        and pu.status = 'success'
        and pu.course_id = p_course_id
        and (
          p_year_id is null
          or (pu.scope = 'year' and pu.year_id = p_year_id)
          or (pu.scope = 'bundle' and p_year_id = any(pu.year_ids))
          or (pu.scope = 'chapter' and ch.year_id = p_year_id)
          or (pu.scope = 'subject' and sb.year_id = p_year_id)
        )
    );
$$;
