# MedVeda controlled Internal Testing packet — 2026-10-18

**Verdict: NO-GO for an AAB or public launch.** This packet uses the existing project `xbvenkfmesugrbjuufyw` and package `in.medveda.app`. No hosted or Play write was made. The read-only hosted evidence was captured at 07:39–07:40 UTC in `evidence/production-readonly.json` and `evidence/production-operations-readonly.json`; recheck it immediately before any approved write. Git already contained extensive uncommitted work and it has been preserved.

## Dependency exposure

The installed mobile tree has two vulnerable roots, reported as 21 high dependency entries by the prior npm audit. These are dependency-chain findings, not 21 demonstrated exploits. `braces@3.0.3` is reached through Expo/React Native Metro → `metro-file-map` → `micromatch@4.0.8`; its nested-pattern stack exhaustion requires an attacker-controlled glob reaching the build server. No mobile app input route to Metro's glob parser was found. `node-forge@1.4.0` is reached through `expo` → `@expo/cli` and `expo-updates` → `@expo/code-signing-certificates`. The installed certificate helper uses forge to generate/read certificates and sign and verify within its Node CLI. `expo-updates` imports it from CLI files; an Android runtime import has not been established. An attacker-controlled low-exponent RSA signature/certificate would be needed for the reported verification flaw. The app's optional update certificate is not present in the checked source; whether a signed update artifact contains any affected native verification path needs actual AAB inspection. No untrusted app data route to forge was found in `mobile-app/src`.

As of 2026-10-18 both [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) list **no patched release**. The Expo 57 [versioned compatibility reference](https://docs.expo.dev/versions/v57.0.0/) pairs it with React Native 0.86 and React 19.2.3, matching the installed baseline. No replacement or override is justified yet. Restrict build inputs, keep the build environment isolated, review any code-signing certificate source, and rerun the registry audit when reachable. The npm registry request in the previous continuation failed DNS; advisory pages were checked separately. The local PDF retry regression test added below does not close these advisories.

## Four migrations: individual production decisions

The remote migration history contains 51 versions matching the first 51 local versions; these four filenames are absent. Local SHA-256 values match `evidence/migrations-current.sha256`. All 55 migrations passed in disposable PostgreSQL 17, including content/RLS checks. This validates the local chain, not live Supabase Auth/Storage or production lock duration. Each SQL file has an explicit transaction. Pre-existing tables, users, notes, purchases and SKUs are retained; no migration changes product prices.

| Approval | Exact file and SHA-256 prefix | Changes and compatibility | Specific failure/recovery risk without verified backup |
| --- | --- | --- | --- |
| P1 | `20261018100000_verified_quiz_attempts.sql` `7c81e686` | Adds question revision/trigger, verified attempt table/RLS and authenticated scoring RPC. Legacy scores remain; old clients continue practice flow. Indexes and `quiz_tests` DDL can lock writes. | Incorrect live grants, trigger conflicts, stale clients or lock contention. Stop dependent mobile rollout; fix forward. New verified attempts cannot be recovered if lost. |
| P2 | `20261018110000_trusted_note_uploads.sql` `1e4af9e6` | Adds note description/upload ledger/save RPC, makes `notes` bucket private with 50 MiB/PDF limits and blocks direct client writes through restrictive policies. Old mobile readers remain compatible; old admin direct upload is intentionally disabled. | Admin upload outage until function/new admin artifact work; existing object URLs need entitlement signing. Bucket/policy errors can interrupt reads or uploads; no verified Storage restore. Coordinate an upload maintenance window. |
| P3 | `20261018120000_note_upload_deleted_retry.sql` `631d3971` | Replaces the save RPC to reject updates of deleted notes and preserve retry behavior. Requires P2. | RPC replacement can reject a previously accepted admin path. Forward repair and retry same upload ID; retain object/ledger. |
| P4 | `20261018130000_note_pdf_quarantine.sql` `7a082d96` | Adds private quarantine bucket, service-only validation queue/leases/RPCs and restrictive Storage policy. Requires P2/P3. Existing content and purchases are untouched. | A divergent existing bucket causes transaction failure; worker failures can leave reserved objects/jobs. Keep worker disabled until validated; never delete ambiguous objects. |

**History warning:** the older packet's four `psql -f` examples apply SQL but do not register Supabase migration history. Do not execute them as written. The Supabase CLI is not installed in this workspace, so its exact behavior against this project has not been exercised. The first approval-ready operation is **P1 only**: confirm the 51-version remote history and target ref, install a reviewed Supabase CLI, stage a temporary project containing the existing `config.toml` and only the SHA-verified P1 file, then use `supabase migration up --db-url "$MEDVEDA_DB_URL"` from that temporary project. Before approval, obtain the CLI's `supabase db push --dry-run --db-url "$MEDVEDA_DB_URL"` preview and confirm it lists P1 only. The database URL must be supplied privately and checked against `xbvenkfmesugrbjuufyw`; never paste it into chat. If the preview lists anything else or the CLI cannot record history, stop. Capture the new history row, schema, grants and counts after P1 before preparing P2. **P1 requires separate explicit owner approval; no command above was run.** [CLI migration reference](https://supabase.com/docs/reference/cli/supabase-migration-list).

The exact P1 shell sequence for operator review is below. The first four lines only stage local files; the dry run is read-only; the final line is the **approval-gated production migration**. Set `MEDVEDA_DB_URL` through a private credential mechanism and verify its host/project before running either CLI command. The final command must be run only after the dry-run output and owner approval are recorded.

```bash
packet_dir=$(mktemp -d /tmp/medveda-p1.XXXXXX)
mkdir -p "$packet_dir/supabase/migrations"
cp /home/ganeshp8545/AyurPulse/supabase/config.toml "$packet_dir/supabase/config.toml"
cp /home/ganeshp8545/AyurPulse/supabase/migrations/20261018100000_verified_quiz_attempts.sql "$packet_dir/supabase/migrations/"
cd "$packet_dir"
sha256sum supabase/migrations/20261018100000_verified_quiz_attempts.sql
supabase db push --dry-run --db-url "$MEDVEDA_DB_URL"
# APPROVAL-GATED WRITE, P1 ONLY:
supabase migration up --db-url "$MEDVEDA_DB_URL"
```

## Trusted PDF deployment order

P2 → P3 → P4 → deploy **only** `upload-note-pdf` with `supabase functions deploy upload-note-pdf --project-ref xbvenkfmesugrbjuufyw` → deploy the reviewed admin artifact → operate `supabase/workers/validate-note-pdf.ts` in a separate limited runtime → controlled isolated test. `supabase/config.toml` specifies `verify_jwt=false` for this function because it authenticates the bearer session, checks `admins` and configured MFA itself. Confirm the deployed JWT setting and negative tests. The worker needs `SUPABASE_URL`, a private `SUPABASE_SERVICE_ROLE_KEY`, 512 MiB initial allocation, a five-minute deadline and a supervisor; it is not an Edge Function. The service key must never enter the admin bundle. The upload route uses bounded multipart input up to 10 MiB and quarantine for larger PDFs. Quarantine has 10-minute leases, five attempts and hash/structure validation. Structural parsing does not scan malware. Real hosted 1/10/near-50 MiB memory, timeout, network failure, duplicate-worker, denial and signed retrieval tests remain NOT VERIFIED. Do not enable near-50 MiB uploads until those checks pass. The function deployment is a separate approval after P2–P4; it must not be bundled with unrelated functions. [Supabase function deployment reference](https://supabase.com/docs/guides/functions/deploy).

The local retry fix in `upload-note-pdf` now downloads and hashes an existing Storage object after an ambiguous upload error before marking the ledger uploaded. A same-size altered object is rejected. This change requires the function to be deployed before hosted behavior changes.

## Four disabled Play jobs and ₹1 catalog

Read-only hosted snapshot: all four jobs run every minute **if** activated; all are inactive. `play-consume` consumes completed purchases, `play-reconcile` checks purchase/refund state, and `play-voids` scans voided purchases to reverse entitlements. They call `play-payment-worker`, authenticate with `PLAY_PAYMENT_CRON_SECRET`, and use leased/idempotent database work. Payment queue was empty in the snapshot. Their exact remote secret values, deployed function revision, Google credentials, retry/alert behavior and live receipts are unverified, so each stays disabled pending its own approval and monitored single-job activation.

`play-catalog-sync` calls `sync-play-catalog` with `PLAY_CATALOG_CRON_SECRET`. One ₹1 job is pending; verified `play_price_tiers` is empty. Source can create a new one-time product, activate a buy option, or rotate a SKU after a mismatch. It can therefore write Play catalog state even while local prices remain ₹1; **activation is unsafe under the owner's price/SKU preservation rule and remains disabled**. An empty verified-tier table means synchronization has not completed, not that Console products are absent. Read-only Console/API comparison of each existing SKU, buy option and ₹1 configured price is required first. No SKU, price, product or purchase record was changed. Final business prices remain a separate owner decision.

For each payment job: recheck queue and entitlement counts, secret name/presence, deployed function revision and recent failures; approve just that job ID; activate it alone; observe first two runs, queue leases, worker response and entitlement deltas; deactivate that job on unexpected changes and retain queued records. For catalog: do not activate until a separately approved plan proves no create/activate/rotate operation can affect the ten ₹1 test products or their SKU mapping.

## Internal Testing and AAB gate

The source package is `in.medveda.app`; Expo 57 targets Android SDK 36. `expo-iap@3.4.4` declares `com.android.vending.BILLING` in its Android manifest; merged AAB permission and actual native Billing Library version remain unverified. `internal-testing` uses the same Supabase project, Play provider, app-bundle build, remote auto-increment and internal-testing channel. Prior read-only EAS remote counter was **2**; highest Play Console version code is unknown, so no next code is selected. Release signing and actual compiled AAB have not been verified. Do not build a purported final signed AAB or upload one until the exact Console maximum, approved deployments, hosted flows and licensed tester setup are confirmed.

Use private dedicated accounts and unpublished draft test content. `active=true` would expose content to the public catalog, so a publish-to-student test needs an approved isolated visibility mechanism. After deployments, test admin note/PDF entitlement and denial, video link/playback, verified MCQ scoring, old/new clients, session and cross-user access on the hosted service. Licensed Play testers must exercise discovery at ₹1, purchase/cancel/pending, invalid/duplicate token, restore, consume, refund/void and revocation with real Play transactions. No forged successful purchase is acceptable.

## Test matrix

| Area | Status | Evidence / remaining condition |
| --- | --- | --- |
| Disposable 55-migration DB, content/RLS, payment mock suite | LOCAL PASS | Existing `evidence/local-suites.log`; no hosted DDL run. |
| Admin mutations, pagination, form tests/build | LOCAL PASS | Existing admin logs and build. |
| PDF body/structure and quarantine worker | LOCAL PASS | Combined PDF/body/hash 9/9; earlier quarantine worker 8/8. No malware scan. |
| Changed upload function type check | LOCAL PASS | `deno check` after retry fix. |
| Mobile TypeScript and Android JS export | LOCAL PASS | Prior unchanged mobile source evidence; neither is an AAB. |
| Website build | LOCAL PASS | Prior 17-page output; unchanged. |
| Hosted history/schema/bucket/cron/price inventory | HOSTED PASS, read-only | Captured JSON snapshot; runtime authorization remains untested. |
| Hosted migrations, PDF/content flows, real billing | NOT VERIFIED | Separate approvals and test accounts needed. |
| Real device and AAB verification | NOT VERIFIED | Console maximum, EAS build, signing and device tests needed. |
| Dependency advisories | BLOCKED | Two unpatched roots / 21 dependency entries; no compatible fix established. |

Production operations awaiting individual approval: P1–P4, upload function deployment, admin/mobile artifacts, separately operated validator, each of four cron activations, isolated hosted test writes, signed AAB creation/upload and any Play Console write. Public launch remains blocked by hosted security/content tests, licensed billing lifecycle, actual AAB/device checks and later owner-approved final prices.
