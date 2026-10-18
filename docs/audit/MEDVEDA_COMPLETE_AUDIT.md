# MedVeda hardening and issue register

## Latest continuation: quarantine and actual production inventory

Read-only Management API inspection succeeded using the existing local operator token (no secret values displayed). [Schema/function evidence](evidence/production-readonly.json) and [operations evidence](evidence/production-operations-readonly.json) supersede earlier access-blocked statements. Hosted history contains 51 matching migration versions; local source now contains 55. Exactly four October 18 migrations are pending, listed in [the deployment preview](evidence/pending-production-migrations.txt). No remote writes occurred.

Production has 28 notes, 4 videos, 1 quiz, 10 products and 25 profiles; 53 private-note objects, with 25 lacking an exact current note reference (review candidates, never deletion authorization). The notes bucket has no per-bucket size/MIME limits and retains admin direct-write policy. `upload-note-pdf` is absent from 13 deployed functions. Play catalog/consume/reconcile/void cron jobs are all inactive; the verified price-tier table is empty; one ₹1 catalog job is pending. All 10 active products are intentionally ₹1 for Play testing; final business prices are a later decision. No price or cron was changed. Backup API lists no backups and PITR is false; independent backups/restorability remain unknown. Disk reports about 1.78 GB available; this is not Storage quota evidence.

Large-upload repair is implemented locally: `20261018130000_note_pdf_quarantine.sql`, `_shared/noteQuarantine.ts`, `_shared/processNotePdfJob.ts`, and `workers/validate-note-pdf.ts`. Above 10 MiB the admin uses authenticated signed quarantine upload; a separate privileged worker verifies size, SHA-256 and structure before immutable promotion and lease-fenced ledger completion. Direct Edge uploads are capped at 10 MiB. No quarantine object is readable by ordinary clients; no auto-delete. Transient jobs retry up to five claims, with expired-lease recovery and explicit same-file rearming; rejected files stay rejected. This is structural validation, not malware scanning. Worker hosting, hard resource limits, credentials, monitoring and hosted tests still require review and approval.

Fresh validation: all 55 migrations and full local suite PASS, including **46 content SQL checks**; **8 worker tests** PASS for corrupt/hash/size rejection, transient download, ambiguous promotion, wrong destination and expired lease; **12 admin mutation operations** pass zero-row rejection/one-row success tests. Admin build and changed Edge/worker type checks PASS. The isolated multipart probe excludes generation: 49 MiB still uses about 313 MiB RSS, supporting the switch away from Edge processing for large PDFs. Hosted quarantine integration and malware coverage remain NOT VERIFIED.


Updated 2026-10-18. Existing hosted project: `xbvenkfmesugrbjuufyw`; no second hosted project is required. **NO-GO for production release.** Local fixes are not deployed. No production writes, Play changes, purchases, or release uploads were performed. Earlier reports are preserved in `evidence/previous-audit/` as historical snapshots; their separate-project requirements are withdrawn.

Recovery: branch `main`, HEAD `75c29c2`; extensive existing uncommitted application, billing, website and backend work retained. See [initial worktree](evidence/worktree-before.txt). There were 53 local migrations on entry; there are now 55 including the forward retry repair. [Before](evidence/migrations-before.sha256) and [current](evidence/migrations-current.sha256) inventories identify exact source bytes. Hosted migration inventory confirms four pending versions and missing upload function. Deployed function source byte equivalence remains NOT VERIFIED.

| ID | Priority | Finding / exact source | Outcome |
|---|---|---|---|
| MV-010 | P2 | `supabase/migrations/20261018110000_trusted_note_uploads.sql`, attached retry branch returned null after `ON DELETE SET NULL` | Fixed by `20261018120000_note_upload_deleted_retry.sql`; 25 content SQL checks pass including deleted-note retry. No object deletion. |
| MV-011 | P2 | `supabase/functions/upload-note-pdf/index.ts`, multipart copies and parser errors | Shared `boundedFormData.ts` bounds streamed bytes, eliminates explicit chunk list/contiguous-copy/Blob chain and returns 400/413. Six new local cases pass. Hosted large-file support remains open. |
| MV-012 | P2 | `admin-panel/src/services/{course,year,subject,chapter,product,user}Service.ts`, update/delete/block calls | Require exactly one returned row; invisible/missing rows no longer silently succeed. Admin build passes; live RLS actions unverified. |
| MV-013 | P2 | `admin-panel/src/pages/{Years,Subjects,Chapters}.tsx`, `handleDelete` | Rejections now appear as alerts and preserve confirmation. Build passes; browser interaction unverified. |
| MV-014 | P2 | `admin-panel/src/components/NoteFormModal.tsx` | Title bound and integer order validated before upload; controls disabled during save to prevent file/form changes mid-request. |
| MV-015 | P1 workflow | `mobile-app/eas.json`, `scripts/check-staging-build.cjs`, `supabase/tests/note_upload_staging_test.ts` | Same-project internal build and explicitly approved upload test supported. Expected URL, Play provider, distinct account IDs and Auth identity checks required. Hosted test not run. |
| MV-016 | P1 review | `mobile-app/package-lock.json`, dependency graph | npm production audit FAIL: 21 high-severity transitive findings from braces/node-forge. No compatible fix offered by audit; forced Expo downgrade rejected. Reachability/native bundle review and compatible upstream fix remain open. |
| MV-001 | P1 if exam | `20261018100000_verified_quiz_attempts.sql`, `quizAttempts.ts`, `syncEngine.ts` | Existing local server scoring retained, SQL tests pass; answers remain client-readable. Practice only; secure examination NOT implemented or claimed. Legacy/offline scores unverified. |
| MV-002 | P1 | `validatePdfStructure.ts`, `upload-note-pdf/index.ts` | Structural validation, admin/MFA and Storage write restriction present. No malware scanner. Near-50 MB hosted memory/CPU safety NOT VERIFIED. |
| MV-003 / 009 | P2 | `save_note_with_upload`, note form/service/mobile types/card | Retry ledger and descriptions retained; old/null descriptions handled by existing code. Local checks pass; old installed clients NOT VERIFIED. |
| MV-004–008 | retained | Content mutations, YouTube validation, delete feedback, responsive pickers, website course copy | Prior fixes preserved. Prior successful checks are not represented as new live integrations. |
| MV-017 | P2 | Admin content, hierarchy, product, user, order and review-flag lists | Fixed with shared page retrieval, stable secondary ID ordering and a 1,001-row boundary test. Admin build passes. Concurrent writes across pages and live large-dataset behavior remain unverified. |
| MV-018 | P1 release | Hosted history, backups, storage recovery, actual AAB, licensed Play tests | BLOCKED by backup/recovery evidence, artifacts/test accounts and change-specific approval; read-only operator access now works. |

The request's complete browser/device repair and validation is not achieved: the compiled routes and local suites do not establish every button or content lifecycle. Remaining gates are explicit in the focused reports and [owner actions](MEDVEDA_MANUAL_ACTIONS_REQUIRED.md).

## Confirmed production blockers

| ID | Priority | Evidence | Required resolution |
|---|---|---|---|
| MV-019 | P1 | `production-operations-readonly.json`: 10 intentionally ₹1 products, zero verified tiers, one pending ₹1 sync | Read-only compare exact database/Console product IDs, buy options and ₹1 prices. Keep catalog sync disabled because it can create/rotate SKUs. No price, tier or product change is authorized. |
| MV-020 | P1 | Same evidence: four inactive Play cron jobs | Review credentials, deployed worker behavior and catalog effects; separately approve activation and verify execution. |
| MV-021 | P1 | `production-readonly.json`: no listed backups, PITR false | Obtain independent backup or protected DB export and local restore proof; recover Storage separately. Existing `.pgpass` has no matching project connection, so pg_dump is blocked by database authentication, not read-only API access. |
| MV-022 | P1 | 51 hosted versions vs 55 local, missing upload function | Four separately reviewed additive migrations, coordinated admin/Edge release and quarantine worker operation. Each production write needs an informed approval that addresses its lock and recovery risk without a verified backup. |
| MV-023 | P2 | 25 objects without exact current note reference | Inventory/reconcile manually; path encoding, historical replacement and ambiguous commits preclude automatic deletion. |

All inspected public tables have RLS enabled. Play service account/package and both cron-secret names are present; values, correctness and real Google permissions were not accessed or verified. The local token enabled metadata inspection only; no worker was invoked.
