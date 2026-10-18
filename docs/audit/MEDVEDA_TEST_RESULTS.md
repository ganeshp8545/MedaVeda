# Test evidence

## Final blocker follow-up (2026-10-18)

The [final blocker packet](MEDVEDA_FINAL_BLOCKER_PACKET.md) separates local, hosted, device and blocked results. Newly run: combined PDF structure/body/hash suite **9/9 PASS**, and `deno check supabase/functions/upload-note-pdf/index.ts supabase/functions/_shared/notePdfHash.ts` **PASS**. The upload retry now compares a pre-existing Storage object against the reserved SHA-256 and size; its regression case is wired into `supabase/tests/run-all.sh`. Existing mobile/admin/DB/website pass evidence was not rerun because those implementations did not change. No hosted integration or AAB test was performed.

## 2026-10-18 continuation

- Admin pagination: `npm test` passes the 1,001-row boundary and later-page error test, PDF/video form checks and 12 mutation cases. `npm run build` passes after pagination changes.
- Disposable PostgreSQL 17: all 55 local migrations and `supabase/tests/run-all.sh` pass, including F8 17/17, verified content 46/46, PDF/body 8/8 and webhook harness 23/23. The first run used the wrong local owner role and failed F8 default-grant assertion; rerunning with the harness's expected `postgres` role passed. No production database was touched.
- Quarantine validator: 8/8 local worker tests pass. `deno check` passes for upload function, catalog function and validator worker.
- Mobile: `npx tsc --noEmit` passes; `npx expo install --check` passes against the bundled SDK 57 map with its online version endpoint unavailable; Android JS export passes at 3,245 modules. This is not an AAB or device test.
- Website: 17 pages built and 17 pages passed the link/structure check.
- Fresh `npm audit` could not reach the npm registry (DNS error). The prior captured audit still reports 21 high findings through two unpatched roots: `braces@3.0.3` via Metro/micromatch and `node-forge@1.4.0` via Expo CLI and expo-updates code signing. No forced Expo downgrade or package override was made. Both root advisories currently list no patched release.

| Root finding | Installed dependency path | Relevance and resolution |
|---|---|---|
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), `braces@3.0.3` | Indirect through `metro-file-map → micromatch → braces`, reached from Expo Metro and React Native Metro | Glob parser stack exhaustion requires attacker-controlled deeply nested patterns. Metro is used for bundling; no app input path to its glob parser was established. No patched `braces` release is listed. |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), `node-forge@1.4.0` | Indirect through `expo-updates → @expo/code-signing-certificates → node-forge`, and through Expo CLI | RSA signature verification weakness matters if the vulnerable verifier is used with an attacker-controlled certificate/signature. The exact shipped native/runtime reachability remains unproven. No patched `node-forge` release is listed. |

The 21 audit entries are affected packages along these dependency paths, not 21 independent root advisories. Compatible patched versions are unavailable as of this check. Revisit when upstream publishes fixes; do not suppress the audit or force an Expo major downgrade.
- No hosted content, purchase, refund, cron, migration, function, Play Console or Android device test was performed in this continuation. Mocked billing passes in the local suite; real Play Billing remains unverified. Current ₹1 prices, Supabase project and backup settings were preserved.

## Latest continuation: quarantine and actual production inventory

Read-only Management API inspection succeeded using the existing local operator token (no secret values displayed). [Schema/function evidence](evidence/production-readonly.json) and [operations evidence](evidence/production-operations-readonly.json) supersede earlier access-blocked statements. Hosted history contains 51 matching migration versions; local source now contains 55. Exactly four October 18 migrations are pending, listed in [the deployment preview](evidence/pending-production-migrations.txt). No remote writes occurred.

Production has 28 notes, 4 videos, 1 quiz, 10 products and 25 profiles; 53 private-note objects, with 25 lacking an exact current note reference (review candidates, never deletion authorization). The notes bucket has no per-bucket size/MIME limits and retains admin direct-write policy. `upload-note-pdf` is absent from 13 deployed functions. Play catalog/consume/reconcile/void cron jobs are all inactive; the verified price-tier table is empty; one ₹1 catalog job is pending. All 10 active products are intentionally ₹1 for Play testing; final business prices are a later decision. No price or cron was changed. Backup API lists no backups and PITR is false; independent backups/restorability remain unknown. Disk reports about 1.78 GB available; this is not Storage quota evidence.

Large-upload repair is implemented locally: `20261018130000_note_pdf_quarantine.sql`, `_shared/noteQuarantine.ts`, `_shared/processNotePdfJob.ts`, and `workers/validate-note-pdf.ts`. Above 10 MiB the admin uses authenticated signed quarantine upload; a separate privileged worker verifies size, SHA-256 and structure before immutable promotion and lease-fenced ledger completion. Direct Edge uploads are capped at 10 MiB. No quarantine object is readable by ordinary clients; no auto-delete. Transient jobs retry up to five claims, with expired-lease recovery and explicit same-file rearming; rejected files stay rejected. This is structural validation, not malware scanning. Worker hosting, hard resource limits, credentials, monitoring and hosted tests still require review and approval.

Fresh validation: all 55 migrations and full local suite PASS, including **46 content SQL checks**; **8 worker tests** PASS for corrupt/hash/size rejection, transient download, ambiguous promotion, wrong destination and expired lease; **12 admin mutation operations** pass zero-row rejection/one-row success tests. Admin build and changed Edge/worker type checks PASS. The isolated multipart probe excludes generation: 49 MiB still uses about 313 MiB RSS, supporting the switch away from Edge processing for large PDFs. Hosted quarantine integration and malware coverage remain NOT VERIFIED.


Updated 2026-10-18. Existing hosted project: `xbvenkfmesugrbjuufyw`; no second hosted project is required. **NO-GO for production release.** Local fixes are not deployed. No production writes, Play changes, purchases, or release uploads were performed. Earlier reports are preserved in `evidence/previous-audit/` as historical snapshots; their separate-project requirements are withdrawn.

| Check | Status | Evidence and limits |
|---|---|---|
| Full 55-migration disposable PostgreSQL 17 run | PASS | [local-suites.log](evidence/local-suites.log): ALL SUITES PASSED; content 46/46, medium DB 34/34; concurrency and external-service mocks included. Real Supabase Auth/Storage not emulated fully. |
| PDF structure + bounded body | PASS | [pdf-tests.log](evidence/pdf-tests.log), 8 tests; size, absent/false Content-Length, malformed multipart and valid payload. No antivirus. |
| Changed Edge entry + hosted harness type check | PASS | [edge-check.log](evidence/edge-check.log). Prior all-16-function check retained, not rerun unnecessarily. |
| Admin form tests | PASS | `npm --prefix admin-panel test`, PDF/YouTube cases. |
| Final admin TypeScript/Vite | PASS | [admin-build.log](evidence/admin-build.log); includes hierarchy feedback and affected-row fixes. |
| Mobile TypeScript | PASS | `cd mobile-app && npx tsc --noEmit`, exit 0 this session. |
| Same-project/staging guard/provider/restore | PASS | [mobile-config-tests.log](evidence/mobile-config-tests.log). Old staging expectations initially failed after intentional profile change; updated assertions now pass. |
| Local payment worker | PASS | [play-worker.log](evidence/play-worker.log); mocked Google responses only. |
| Play catalog/API/offer tests | PASS | [play-catalog.log](evidence/play-catalog.log); fake external API. |
| Checkout/password/signature/purchases | PASS | [mobile-other.log](evidence/mobile-other.log); local/mock tests. |
| Admin production dependencies | PASS | [admin-dependencies.log](evidence/admin-dependencies.log), zero npm vulnerabilities. |
| Mobile production dependencies | FAIL | [mobile-dependencies.log](evidence/mobile-dependencies.log), 21 high findings. No forced downgrade performed. |
| Synthetic PDF 1/10/49 MiB | PASS parsing only | [pdf-size-local.log](evidence/pdf-size-local.log), approximately 32/138/638 ms wall time, 69/132/406 MiB RSS including fixture generation/client encoding. Not hosted memory, peak memory, CPU limit, realistic complexity or transfer evidence. |
| Mobile JS export / website generation & links | PASS (prior evidence) | Previous audit passed export (3,245 modules), website 17-page links. Unchanged runtime/site code not re-exported. |
| Hosted migrations/grants/RLS/functions/cron | BLOCKED | Management API read-only inspection PASS; runtime authorization tests and deployed source byte equivalence remain NOT VERIFIED. |
| Browser/device content and access tests | NOT VERIFIED | No authenticated test sessions; ADB socket startup denied in sandbox. No device interaction claimed. |
| Backups, restore, free capacity, Storage object recovery | NOT VERIFIED | Backup API returned no backups/PITR false; disk available 1.78 GB; independent restore and Storage recovery unverified. |
| Play licensed purchase/refund/restore; prices | BLOCKED | No Console access/license users. No synthetic successful transactions inserted. |
| New AAB / EAS version / Console maximum | BLOCKED | No actual bundle or Console maximum. EAS remote Android counter is 2 (read-only check); this does not establish code 3 availability. |

Fresh outputs are stored as logs. Initial network-restricted npm audits failed DNS; network-authorized read-only reruns yielded the results above. The final full SQL run includes the eight PDF/body tests; eight quarantine worker tests ran separately. No result is a real hosted end-to-end integration unless explicitly stated (none here).

Additional fresh logs: [admin mutation cases](evidence/admin-tests.log), [quarantine worker tests](evidence/quarantine-worker-tests.log), [isolated PDF resource probe](evidence/pdf-stream-resource.log). The final local suite has 46 content checks. Read-only hosted schema/policies/grants/functions/buckets/cron/prices/disk inventories PASS as inspection; the observed missing deployments, empty verified tiers and disabled jobs are FAIL readiness findings. The ₹1 prices are intentional. Enabled RLS and secret-name presence do not establish runtime authorization or secret correctness.

EAS Android version inspection: PASS read-only query, [`eas-android-version.json`](evidence/eas-android-version.json) reports **2**. Highest Play Console code is still NOT VERIFIED; do not assume 3 is available. No build/version increment/upload ran. The automatic approval reviewer timed out on one combined local edit/test request; splitting edits from the local test command resolved the timeout and the tests subsequently ran successfully. No operation remains blocked by that review timeout.
