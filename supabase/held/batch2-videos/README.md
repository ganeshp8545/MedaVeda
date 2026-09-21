# Batch 2 (paid videos) - HELD INDEFINITELY, NOT DEPLOYED

Decision (2026-09-21): existing videos stay free. Nothing in this folder is applied by
`supabase db push` (it is deliberately outside `supabase/migrations/`), and the mobile
changes are NOT in the working tree - they are saved as `mobile-app.patch` +
`mobile-app/src/services/secureVideosService.ts`.

## Migration filename is a placeholder (never collides)
The migration is named `99990101000000_batch2_videos_free_preview_only.sql` on purpose. It was first
written as `20260928100000_...`, which is now taken by `20260928100000_referral_settings_limits_and_audit.sql`
(and `20260928110000` by the referral-off wallet fix). A far-future prefix cannot collide with any real
migration, and `supabase db push` would refuse to apply it out of order anyway. **When you restore it, rename
it to a real timestamp later than the newest file in `supabase/migrations/`** (and update the path in
`batch2_guard.sh` and the "Run AFTER" line in `batch2_checks.sql`). Do not push it under the placeholder name.

## Why it must stay held
* The migration makes only `is_free_preview` videos readable from the table. On live 3 of the
  4 videos are `is_free_preview = false`, so applying it would lock them.
* The 1.2.0 app build (patch) lists videos through `get_videos()`, which only exists after the
  migration. Shipping the app without the migration (or the reverse) breaks the Videos screen.
* The older test suites (multi_course, null_year_fallback, phase1a_old_build_compat) were edited to
  count videos through `get_videos()` - see `older-suite-assertions.patch` - and were reverted.

## Future work: paid videos alongside free ones
Goal: new videos can be added as PAID while the existing ones stay free.
1. Data: `update public.videos set is_free_preview = true` for the existing rows (this is what
   "stay free" means once the table policy is free-preview-only), and make new videos default to
   paid (`is_free_preview` already defaults to false).
2. Admin panel: a "free preview" toggle on the video form (the column exists).
3. Then apply this batch (after everything in supabase/DEPLOY_ORDER.md): publish app 1.2.0 -> raise
   `app_config.min_app_version` to 1.2.0 -> apply the migration (its guard refuses otherwise).
4. Products: paid videos need `products` rows of `product_type = 'video'` (already supported by
   create_priced_order) so a student can buy them; entitlement is `user_can_access_video()`.
Restore with: `git apply supabase/held/batch2-videos/mobile-app.patch`, copy the service file back,
move the migration into `supabase/migrations/` (renamed to a fresh timestamp, see above), and re-run `batch2_checks.sql` / `batch2_guard.sh`.
