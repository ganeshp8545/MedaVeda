# Changes in this continuation

## Latest continuation: quarantine and actual production inventory

Read-only Management API inspection succeeded using the existing local operator token (no secret values displayed). [Schema/function evidence](evidence/production-readonly.json) and [operations evidence](evidence/production-operations-readonly.json) supersede earlier access-blocked statements. Hosted history contains 51 matching migration versions; local source now contains 55. Exactly four October 18 migrations are pending, listed in [the deployment preview](evidence/pending-production-migrations.txt). No remote writes occurred.

Production has 28 notes, 4 videos, 1 quiz, 10 products and 25 profiles; 53 private-note objects, with 25 lacking an exact current note reference (review candidates, never deletion authorization). The notes bucket has no per-bucket size/MIME limits and retains admin direct-write policy. `upload-note-pdf` is absent from 13 deployed functions. Play catalog/consume/reconcile/void cron jobs are all inactive; the verified price-tier table is empty; one ₹1 catalog job is pending. All 10 active products are intentionally ₹1 for Play testing; final business prices are a later decision. No price or cron was changed. Backup API lists no backups and PITR is false; independent backups/restorability remain unknown. Disk reports about 1.78 GB available; this is not Storage quota evidence.

Large-upload repair is implemented locally: `20261018130000_note_pdf_quarantine.sql`, `_shared/noteQuarantine.ts`, `_shared/processNotePdfJob.ts`, and `workers/validate-note-pdf.ts`. Above 10 MiB the admin uses authenticated signed quarantine upload; a separate privileged worker verifies size, SHA-256 and structure before immutable promotion and lease-fenced ledger completion. Direct Edge uploads are capped at 10 MiB. No quarantine object is readable by ordinary clients; no auto-delete. Transient jobs retry up to five claims, with expired-lease recovery and explicit same-file rearming; rejected files stay rejected. This is structural validation, not malware scanning. Worker hosting, hard resource limits, credentials, monitoring and hosted tests still require review and approval.

Fresh validation: all 55 migrations and full local suite PASS, including **46 content SQL checks**; **8 worker tests** PASS for corrupt/hash/size rejection, transient download, ambiguous promotion, wrong destination and expired lease; **12 admin mutation operations** pass zero-row rejection/one-row success tests. Admin build and changed Edge/worker type checks PASS. The isolated multipart probe excludes generation: 49 MiB still uses about 313 MiB RSS, supporting the switch away from Edge processing for large PDFs. Hosted quarantine integration and malware coverage remain NOT VERIFIED.


Updated 2026-10-18. Existing hosted project: `xbvenkfmesugrbjuufyw`; no second hosted project is required. **NO-GO for production release.** Local fixes are not deployed. No production writes, Play changes, purchases, or release uploads were performed. Earlier reports are preserved in `evidence/previous-audit/` as historical snapshots; their separate-project requirements are withdrawn.

New work, distinct from preserved prior fixes:

- Forward SQL repair `20261018120000_note_upload_deleted_retry.sql`; content suite grows from 24 to 25 checks.
- `boundedFormData.ts`, upload endpoint and six regression tests: bounded stream, fewer explicit copies, 400/413 errors.
- Course/year/subject/chapter/product/user mutation services require one affected row.
- Year/subject/chapter delete rejection alerts; note title/order validation and controls locked while saving.
- Internal-testing EAS profile pins existing project and Play Billing; same-project guard/test plus revised legacy staging test expectations. No version-code or pricing changes.
- Hosted upload harness now requires explicit one-object approval, existing project and authenticated dedicated account identities. No remote invocation performed.
- Read-only production preflight and ledger inventory wording; CI runs build/provider/restore guards and SQL runner includes new body tests.
- All ten current audit reports updated; old reports archived as text in `evidence/previous-audit/`. Current local logs/checksums preserved.

No commit/reset/revert, production mutation, customer deletion, Play product change or AAB upload occurred. Existing unrelated dirty files remain.

Continuation after resource measurement: implemented private large-PDF quarantine, SQL worker leases/retry/finalization, immutable promotion and admin progress/polling. Added 8 worker regressions, 21 quarantine SQL checks (total content suite 46), standalone reproducible resource probe, and 12-operation mutation harness. Captured actual read-only production evidence; no remote writes. Five source test/worker modules are now checked by CI/runner as appropriate.
