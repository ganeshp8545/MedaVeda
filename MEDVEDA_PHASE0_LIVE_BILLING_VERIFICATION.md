# MedVeda Phase 0 live billing verification

**Date:** 2026-10-16 UTC  
**Decision:** **NO-GO** for live billing and automatic price synchronization.  
**Scope:** Historical read-only source and local-environment inspection, with the existing [dynamic pricing audit](MEDVEDA_DYNAMIC_PRICING_BILLING_AUDIT.md) as context. No Play Console, hosted Supabase, EAS build, signed AAB, tester device, or failed order was accessible in that session. No query against a live service was executed. This report was the only file created in that session; the checkout already had unrelated uncommitted work. No code, price, Console product, database row, secret, deployment, purchase, or Git history was changed in that session. The current [complete audit](MEDVEDA_COMPLETE_PLAY_STORE_AUDIT.md) supersedes this report's implementation priorities.

**17 October business-rule correction:** All educational videos are free; Play purchases cover paid notes/PDFs in chapter, subject, year and bundle scopes. Video playback is outside Billing. The current complete audit records the local purchase-offer/catalog guards and paid-note entitlement verification plan; this Phase 0 report does not establish live deployment or purchase success.

**Evidence labels:** **VERIFIED SOURCE** = directly inspected in this checkout; **VERIFIED LIVE** = directly inspected in the relevant hosted service or installed artifact; **OWNER-REPORTED** = supplied by the owner; **NOT VERIFIED** = no authorized direct evidence. There are **no VERIFIED LIVE findings** in this report. Local configuration and earlier audit documents do not prove hosted state. References to code use line numbers from this working tree, which may differ from the uploaded AAB.

## 1. Executive Summary

- **VERIFIED SOURCE:** Android source declares `in.medveda.app` and version `1.2.0` ([app.json](mobile-app/app.json#L2)); EAS uses remote versioning and auto-increment for the `internal-testing` AAB profile ([eas.json](mobile-app/eas.json#L1), [same](mobile-app/eas.json#L54)). Uploaded versionCode `2`, signature, Billing permission in the merged AAB, and binary identity are **OWNER-REPORTED / NOT VERIFIED**.
- **VERIFIED SOURCE:** Play checkout requires an active hosted `play_price_tiers` row with exact `products.price`, then a live INR offer at the same amount ([create_play_order](supabase/migrations/20261012100000_google_play_ucb.sql#L131), [mobile offer check](mobile-app/src/services/playBillingService.ts#L284)). The checked-in seed has `tiers: []` ([seed](supabase/seed/play_price_tiers.json#L1)); hosted tiers and Console products are **NOT VERIFIED**.
- **OWNER-REPORTED / NOT VERIFIED:** The purchase sheet opened and the user saw “Could not confirm the purchase. Try again.” There is no failed order ID, device trace, HTTP status, Billing response code, or hosted function log. The failure boundary and root cause remain **NOT VERIFIED**.
- **VERIFIED SOURCE:** Server verification, atomic settlement, consumption, and recovery code exist. Their deployment, credentials, schedule, and successful licensed end-to-end execution are **NOT VERIFIED**. The recommended next action is a read-only correlation of one failed attempt across device, Console, function invocations, and order status.

## 2. Verified Local Source Findings

| Finding | Evidence | Limit |
|---|---|---|
| Play route and quote | `usePurchase` selects Play; screen fetches quote, creates order, checks price, fetches Play product, and starts purchase ([hook](mobile-app/src/hooks/usePurchase.ts#L34), [screen](mobile-app/src/screens/payment/PlayBillingScreen.tsx#L85)). | **VERIFIED SOURCE** only. Installed binary may differ. |
| Native billing dependency | `expo-iap` 3.4.4 is declared and its installed library manifest declares `com.android.vending.BILLING` ([package](mobile-app/package.json#L29), [library manifest](mobile-app/node_modules/expo-iap/android/src/main/AndroidManifest.xml#L2)). | Merged release AAB and resolved BillingClient version **NOT VERIFIED**. |
| Server order and settlement | `create_play_order` snapshots product price/SKU; `settle_play_purchase` validates ownership and writes payment, purchase, and paid order atomically ([order](supabase/migrations/20261012100000_google_play_ucb.sql#L123), [settlement](supabase/migrations/20261012100000_google_play_ucb.sql#L206)). | Hosted migration/function versions **NOT VERIFIED**. |
| Price-tier inventory | Checked-in seed contains no tiers; `notes_<whole INR>` is only a format constraint ([seed](supabase/seed/play_price_tiers.json#L1), [validator](supabase/seed/apply-play-price-tiers.mjs#L20)). | No actual Play Product ID or purchase option ID confirmed. |
| Project hints | Local linked project reference is present; EAS `internal-testing` uses a staging target and preview environment, while `production` uses a different profile ([eas.json](mobile-app/eas.json#L42)). | The project targeted by the installed AAB is **NOT VERIFIED**. Do not query or change a project based on the local link alone. |
| Local logs | The two `.expo/dev/logs` files had no lines containing the exact reported phrase or the searched Play function/tier markers. | These are developer/export logs, not the affected tester's device or hosted logs. |

## 3. Google Play Console Inventory

| Item | Finding / exact read-only check |
|---|---|
| Package and app | **NOT VERIFIED.** In Play Console, select the MedVeda app and confirm package `in.medveda.app` on the app dashboard. Source declaration is **VERIFIED SOURCE** ([app.json](mobile-app/app.json#L14)). |
| Uploaded internal AAB, version name/code, Billing availability | **NOT VERIFIED.** Open **Test and release → Testing → Internal testing → Releases**; inspect the active release, artifact details, version name/code, rollout status and tester availability. Obtain the exact uploaded AAB or build record for read-only manifest/dependency inspection; compare package, version, signature, Billing permission, resolved Billing library, and Supabase endpoint with the installed build. Owner reports `1.2.0`/versionCode `2` and an uploaded AAB. [Google internal testing help](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en). |
| One-time products, IDs, options, states, India price | **NOT VERIFIED.** Open **Monetize with Play → Products → One-time products**. Record every product ID, product state, BUY purchase option ID/state, India availability, INR regional price, and effective state for the tester; compare to hosted tiers. Do not assume fixture IDs such as `notes_49` are live. [Google one-time product guidance](https://support.google.com/googleplay/android-developer/answer/16430488?hl=en-419). |
| Developer API and service account | **NOT VERIFIED.** In Google Cloud, inspect whether Android Publisher API is enabled for the intended project. In Play Console **Users and permissions**, inspect the service account's app access and billing-related permissions; compare its identity with the server secret through an authorized operator without revealing the key. Inspect API error status in function logs. [Google API setup](https://developers.google.com/android-publisher/getting_started). |

**OWNER-REPORTED:** No One-time Products exist. This is an important hypothesis, but without a Console inventory it does not establish the current catalog or where the reported attempt failed. No Console product or price was created or edited.

## 4. Hosted Supabase Inventory

**NOT VERIFIED:** No connected Supabase project session, database credential, or Supabase CLI was available here. A Supabase integration can be connected separately, but it was not connected during this audit. No hosted SQL was executed. First confirm the project reference shown by the installed build and Supabase dashboard; do not assume the local linked project is the payment target. In the correct project, use **SQL Editor** with a read-only role or equivalent authorized read-only interface. Review query outputs locally; share only aggregate/redacted results.

```sql
-- Run each SELECT separately in the confirmed project; stop if an object is absent.
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 30;
SELECT to_regclass('public.play_price_tiers') AS tiers_table,
       to_regclass('public.play_payment_jobs') AS jobs_table,
       to_regclass('public.play_recovery_cursor') AS recovery_table,
       to_regprocedure('public.create_play_order(uuid,text)') AS order_rpc,
       to_regprocedure('public.settle_play_purchase(uuid,text,text,text,text,timestamptz)') AS settlement_rpc;
SELECT scope, price, active, count(*) AS product_count
  FROM public.products GROUP BY scope, price, active ORDER BY scope, price, active;
SELECT price_inr, play_sku, active FROM public.play_price_tiers ORDER BY price_inr;
SELECT p.scope, p.price, p.active AS product_active,
       t.play_sku, t.active AS tier_active, count(*) AS product_count
  FROM public.products p LEFT JOIN public.play_price_tiers t ON t.price_inr = p.price
 GROUP BY p.scope, p.price, p.active, t.play_sku, t.active
 ORDER BY p.scope, p.price;
SELECT status, count(*) AS order_count FROM public.orders
 WHERE provider = 'play' GROUP BY status ORDER BY status;
SELECT play_consumption_status, count(*) AS order_count FROM public.orders
 WHERE provider = 'play' AND status = 'paid'
 GROUP BY play_consumption_status ORDER BY play_consumption_status;
SELECT status, count(*) AS payment_count FROM public.payments
 WHERE provider = 'play' GROUP BY status ORDER BY status;
SELECT p.status, count(*) AS purchase_count FROM public.purchases p
 JOIN public.orders o ON o.id = p.order_id
 WHERE o.provider = 'play' GROUP BY p.status ORDER BY p.status;
```

These queries expose no customer identifiers or tokens. A row in `play_price_tiers` is still insufficient until Console product/option state and tester-visible price are checked. The owner prices remain **OWNER-REPORTED**: chapter INR 49, subject INR 149, year INR 499, bundle INR 599. No hosted `products` row or price was observed.

## 5. Migration and Function Deployment Status

**NOT VERIFIED:** Presence of SQL/Edge Function files does not establish deployment. In the confirmed Supabase project, compare the read-only migration result above to at least `20261012100000` (Play order/settlement), `20261012110000` (refund reversal), `20261015100000` (Play jobs), and `20261015120000` (entitlement order snapshot). Inspect actual RPC signatures and grants before any rollout. The earlier [local PostgreSQL QA report](docs/PLAY_PAYMENT_POSTGRES_QA_2026-10-15.md#L13) notes unrelated 20261014 migrations in the directory; do not run `db push` for diagnosis.

Open **Supabase Dashboard → Edge Functions** and inspect deployed versions, invocation history, error rates and JWT settings for `create-play-order`, `verify-play-purchase`, and `play-payment-worker`. The source expects JWT protection on the first two and a worker secret on the last ([config](supabase/config.toml#L22), [worker](supabase/functions/play-payment-worker/index.ts#L25)). Check **Edge Functions → Secrets** for the required secret **names and validity**, never values: `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, and `PLAY_PAYMENT_CRON_SECRET` ([Google helper](supabase/functions/_shared/googlePlay.ts#L23), [cron setup](supabase/play_payment_cron_setup.sql#L1)). A secret's presence alone does not prove permissions or API success. [Supabase function logs](https://supabase.com/docs/guides/functions/logging), [secret management](https://supabase.com/docs/guides/functions/secrets).

## 6. License Testing Status

**NOT VERIFIED:** No tester account, opt-in state, country, Play Store install provenance, or license-testing membership was inspected. Open **Play Console → Test and release → Testing → Internal testing → Testers** and confirm the tester list, release eligibility and opt-in link; on the tester device confirm the same Google account accepted the opt-in and installed through Play. Open **Play Console → Settings → License testing** and confirm that account is present and the intended test response is configured. Record only membership/status, not the account address in this report. [Internal testing](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en), [license testing](https://support.google.com/googleplay/android-developer/answer/6062777?hl=en-419).

## 7. Billing Product and Price Mapping

| Content scope | Owner price | Hosted active product | Hosted active tier/SKU | Console active BUY option/INR price | Usable now? |
|---|---:|---|---|---|---|
| Chapter | INR 49 | **NOT VERIFIED** | **NOT VERIFIED** | **NOT VERIFIED** | **NOT VERIFIED** |
| Subject | INR 149 | **NOT VERIFIED** | **NOT VERIFIED** | **NOT VERIFIED** | **NOT VERIFIED** |
| Year | INR 499 | **NOT VERIFIED** | **NOT VERIFIED** | **NOT VERIFIED** | **NOT VERIFIED** |
| Bundle | INR 599 | **NOT VERIFIED** | **NOT VERIFIED** | **NOT VERIFIED** | **NOT VERIFIED** |

**VERIFIED SOURCE:** The current design shares a consumable Play SKU by exact INR price, while entitlements are bound to individual `products.id` and orders ([tier table](supabase/migrations/20261012100000_google_play_ucb.sql#L5), [order snapshot](supabase/migrations/20261012100000_google_play_ucb.sql#L138)). The mobile client requires one matching full-price INR BUY offer and does not persist a purchase option ID ([offer selection](mobile-app/src/services/playOfferSelection.ts#L14)). The backend uses Google `purchases.products:get` and checks SKU and identity, not a provider-reported paid price ([verification](supabase/functions/verify-play-purchase/index.ts#L27)). Consequently, do not change the price of a reused SKU while prior orders may remain outstanding. No actual Product ID or purchase option ID match is **VERIFIED LIVE**.

## 8. Payment Error Root Cause Investigation

The exact reported sentence “Could not confirm the purchase. Try again.” was not found in the inspected Play source. **VERIFIED SOURCE:** `authenticatedPost` falls back to “Could not confirm the purchase.” for a non-2xx response without an `error` field ([service](mobile-app/src/services/playBillingService.ts#L70)); the screen separately offers a “Try again” button ([screen](mobile-app/src/screens/payment/PlayBillingScreen.tsx#L130)). This could explain the owner's combined wording, but the installed AAB and screenshot are **NOT VERIFIED**. It could also be an older build or another UI. No actual failed-order root cause is verified.

| Step | Expected behavior | Actual verified behavior | Source | Available log evidence | HTTP / Billing code | Possible failure; confidence |
|---|---|---|---|---|---|---|
| 1. User selects product | Navigate to Play billing with product ID. | **VERIFIED SOURCE** route only; affected tap **NOT VERIFIED**. | [usePurchase:34](mobile-app/src/hooks/usePurchase.ts#L34) | None from device. | N/A | Wrong product/build/provider; **low**. |
| 2. Mobile requests order | Authenticated `create-play-order` POST. | **VERIFIED SOURCE** request implementation; live request **NOT VERIFIED**. | [screen:87](mobile-app/src/screens/payment/PlayBillingScreen.tsx#L87), [service:91](mobile-app/src/services/playBillingService.ts#L91) | No invocation trace. | Possible 401/400/429/500/503; actual **unknown**. | Auth, network, function absence; **low**. |
| 3. Backend reads price | Read active product and derive server price. | **VERIFIED SOURCE** code; hosted row **NOT VERIFIED**. | [function:14](supabase/functions/create-play-order/index.ts#L14), [SQL:131](supabase/migrations/20261012100000_google_play_ucb.sql#L131) | None. | 400 for unavailable product; actual **unknown**. | Product inactive/course mismatch; **low**. |
| 4. Backend finds tier | Exact active `price_inr` maps to SKU; order snapshots price. | Seed empty **VERIFIED SOURCE**; hosted tier **NOT VERIFIED**. | [SQL:134](supabase/migrations/20261012100000_google_play_ucb.sql#L134), [seed](supabase/seed/play_price_tiers.json#L1) | None. | 400 `price_tier_missing` if absent; actual **unknown**. | Missing/inactive hosted tier; **low** for this attempt. |
| 5. Billing queries details | Fetch SKU and one matching INR BUY offer. | **VERIFIED SOURCE** implementation; Play response **NOT VERIFIED**. | [service:284](mobile-app/src/services/playBillingService.ts#L284), [offer:20](mobile-app/src/services/playOfferSelection.ts#L20) | No device ProductDetails trace. | Billing response **unknown**. | No product, option/region/price mismatch; **low**. |
| 6. Billing launches purchase | `requestPurchase` sends SKU, offer token and obfuscated IDs. | **VERIFIED SOURCE** implementation; sheet opening **OWNER-REPORTED**. | [service:253](mobile-app/src/services/playBillingService.ts#L253) | No device event. | Billing response **unknown**. | Launch rejection or stale offer; **low**. |
| 7. Callback returns result | Listener handles purchased, pending, cancelled or native error. | **VERIFIED SOURCE** handlers; actual callback **NOT VERIFIED**. | [service:175](mobile-app/src/services/playBillingService.ts#L175), [service:220](mobile-app/src/services/playBillingService.ts#L220) | No callback trace. | Billing response **unknown**. | Pending/cancel/error/lost callback; **low**. |
| 8. Backend verifies token | Authenticated POST; Google lookup validates state, SKU, IN region and user/order hashes. | **VERIFIED SOURCE** code; invocation and Google result **NOT VERIFIED**. | [function:19](supabase/functions/verify-play-purchase/index.ts#L19), [Google helper:90](supabase/functions/_shared/googlePlay.ts#L90) | No function or Google error log. | 401/403/409/429/503 possible; actual **unknown**. | API credential/permission, identity or state mismatch; **low**. |
| 9. Database settles | Atomic RPC writes payment, purchase and paid order. | **VERIFIED SOURCE** SQL; hosted invocation **NOT VERIFIED**. | [function:41](supabase/functions/verify-play-purchase/index.ts#L41), [SQL:206](supabase/migrations/20261012100000_google_play_ucb.sql#L206) | No RPC/order evidence. | 503 on settlement failure; actual **unknown**. | Missing migration/constraint/conflict; **low**. |
| 10. Entitlement granted | Successful purchase snapshot gives access. | **VERIFIED SOURCE** insert/trigger; hosted purchase **NOT VERIFIED**. | [SQL:244](supabase/migrations/20261012100000_google_play_ucb.sql#L244), [snapshot trigger](supabase/migrations/20261015120000_play_entitlement_order_snapshot.sql#L6) | No purchase/access result. | No separate HTTP status; actual **unknown**. | Duplicate purchase, missing snapshot/access mismatch; **low**. |
| 11. Purchase consumed | Server calls Google `:consume`, marks status; worker retries failures. | **VERIFIED SOURCE** code; hosted result **NOT VERIFIED**. | [function:49](supabase/functions/verify-play-purchase/index.ts#L49), [worker:59](supabase/functions/play-payment-worker/index.ts#L59) | No consumption/worker log. | Google status **unknown**. | API error, missing cron, parked job; **low**. |

**Failure timing: NOT VERIFIED.** The owner's report of a purchase sheet opening suggests steps 1–6 may have occurred, but does not prove a completed charge or that verification was reached. An absent Console product would normally block at product lookup before a completed Play purchase; it cannot be selected as the root cause from the available evidence. Correlate one attempt with the installed build's timestamp, a private/redacted order reference, client step and Billing code, function invocation statuses, and token-free order/payment/purchase state. Do not paste a purchase token, JWT, raw service-account JSON, or personal data.

## 9. Worker and Recovery Status

**VERIFIED SOURCE:** On app launch/login/resume, unconsumed purchases are rechecked ([App](mobile-app/App.tsx#L51), [restore](mobile-app/src/services/playBillingService.ts#L297)). The server worker has consume, reconcile and void phases; leased Play jobs and recovery cursor are defined in SQL ([worker](supabase/functions/play-payment-worker/index.ts#L242), [jobs](supabase/migrations/20261015100000_play_payment_jobs.sql#L7)). The checked-in cron script is explicitly **review-only**, not evidence it was installed ([cron setup](supabase/play_payment_cron_setup.sql#L1)). **NOT VERIFIED:** worker deployment, cron activation, runs, queue depth, pending purchase count and reconciliation completion.

In **Supabase Dashboard → Integrations → Cron**, inspect `play-consume`, `play-reconcile`, and `play-voids`, their active state and recent runs. In **Edge Functions → play-payment-worker → Invocations/Logs**, inspect recent status codes by phase. [Supabase Cron](https://supabase.com/docs/guides/cron), [function logs](https://supabase.com/docs/guides/functions/logging). In SQL Editor, run only these redacted summaries after confirming the jobs migration exists:

```sql
SELECT jobname, active, schedule FROM cron.job
 WHERE jobname IN ('play-consume','play-reconcile','play-voids') ORDER BY jobname;
SELECT j.jobname, d.status, count(*) AS run_count, max(d.start_time) AS last_start
  FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
 WHERE j.jobname IN ('play-consume','play-reconcile','play-voids')
 GROUP BY j.jobname, d.status ORDER BY j.jobname, d.status;
SELECT kind, status, count(*) AS job_count, min(next_attempt_at) AS oldest_next_attempt
  FROM public.play_payment_jobs GROUP BY kind, status ORDER BY kind, status;
SELECT play_consumption_status, count(*) AS order_count
  FROM public.orders WHERE provider = 'play' AND status = 'paid'
 GROUP BY play_consumption_status ORDER BY play_consumption_status;
```

Do **not** select `cron.job.command`, job `last_error`, order `purchase_token`, or raw function request bodies; these can disclose secrets or payment identifiers. If counts show paid orders with pending/failed consumption or parked jobs, an authorized operator must investigate promptly through the existing incident process before changing catalog configuration.

## 10. Remaining External Verification Steps

1. **Build and tester:** Record internal-testing release/versionCode, installed package/build source, tester opt-in and license-testing status from the Console pages in sections 3 and 6. Confirm which Supabase project the installed AAB addresses. **NOT VERIFIED**.
2. **Console catalog:** Export a redacted table of each existing Product ID, purchase option ID, active state, India BUY price and availability. Compare against the four owner prices and hosted tier rows. **NOT VERIFIED**.
3. **Hosted schema and data:** In the confirmed project, run the SELECT inventory in sections 4 and 9. Compare applied migration versions, product prices, tiers, payment/purchase counts and pending jobs. **NOT VERIFIED**.
4. **Functions and API:** Inspect deployments, invocation HTTP statuses, required secret names, Android Publisher API enablement and service-account permissions using section 5 and Console/Cloud pages. **NOT VERIFIED**.
5. **One failed attempt:** Obtain timestamp, screen/screenshot, build code, client step and Billing response code; correlate with `create-play-order` and `verify-play-purchase` invocations and the corresponding order's safe status fields. If the owner can identify a private order ID, query it in the SQL Editor and share only status, provider, SKU, amount, consumption status and timestamps; keep the actual ID and token private. **NOT VERIFIED**.
6. **Only after the configuration mismatch is known:** Plan a licensed end-to-end staging purchase and recovery/refund checks under separate explicit authorization. No purchase was made here.

## 11. Critical and High Blockers

No **CRITICAL** exploitable source defect was established by this Phase 0 inspection. The following issue ledger covers the current release blockers and diagnostic gaps. Root-cause confidence refers to the **reported failed attempt**, not confidence that the cited source exists.

| ID / severity | Evidence | Root-cause confidence | Impact | Recommended fix |
|---|---|---|---|---|
| P0-1 **HIGH** | **NOT VERIFIED** installed AAB, tester status, Console catalog and hosted project; source/EAS alone cannot identify the live path ([eas.json](mobile-app/eas.json#L54)). | **Unknown** | Cannot establish whether Billing is available or which backend receives requests. | Read-only build/Console/project inventory first. |
| P0-2 **HIGH** | **VERIFIED SOURCE** empty tier seed and exact active-tier gate ([seed](supabase/seed/play_price_tiers.json#L1), [SQL](supabase/migrations/20261012100000_google_play_ucb.sql#L134)); hosted rows **NOT VERIFIED**. | **Low** for reported failure | A missing hosted tier prevents order creation; no tier is confirmed usable. | Inventory hosted tiers against Console options; later configure only exact approved matches if absent. |
| P0-3 **HIGH** | **OWNER-REPORTED** error; no failed order ID, HTTP status, Billing response code, function log or payment state. The source has only a partial text match ([service](mobile-app/src/services/playBillingService.ts#L85)). | **Unknown** | A paid but unentitled transaction cannot be ruled out. | Correlate one attempt and check token-free order/payment/purchase status before any retry or configuration write. |
| P0-4 **HIGH** | **VERIFIED SOURCE** recovery worker/cron definition; actual deployment/runs **NOT VERIFIED** ([worker](supabase/functions/play-payment-worker/index.ts#L242), [cron](supabase/play_payment_cron_setup.sql#L1)). | **Low** for reported failure | Consumption/reconciliation and refund reversal may lag or stop. | Read-only deployment, cron, queue and run-history check; prioritize any paid pending/failed orders. |
| P0-5 **HIGH** | **NOT VERIFIED** applied migrations, function versions, secret validity and Google API permission; source requires all ([verify function](supabase/functions/verify-play-purchase/index.ts#L27), [jobs SQL](supabase/migrations/20261015100000_play_payment_jobs.sql#L7)). | **Low** for reported failure | Server verification may fail even if Play charges. | Compare hosted migration/function history and API error statuses; repair only the demonstrated gap later. |
| P0-6 **MEDIUM** | **VERIFIED SOURCE** one INR offer is selected without stored purchase option ID ([offer](mobile-app/src/services/playOfferSelection.ts#L14)); Console option inventory **NOT VERIFIED**. | **Low** | Ambiguous options or regional mismatch can prevent checkout. | Inspect options; if multiple legitimate options exist, design explicit option identity in a later code/schema phase. |

## 12. Minimum Required Fixes

No fix is authorized or justified before the read-only results above. Choose the smallest **conditional** remedy based on the first demonstrated failing step:

| Demonstrated gap | Minimum later action | Type / new AAB? |
|---|---|---|
| Console Product ID/BUY option absent, inactive, unavailable to India/tester, or priced differently | Create/activate or correct the approved product/option only after owner review; preserve INR 49/149/499/599 and verify read-back. | Play Console configuration; **no AAB** if installed client already supports it. |
| Hosted tier missing/inactive/mismatched | Add or activate only the exact approved tier after Console read-back and pending-order review. | Hosted data configuration; **no AAB** if code path is already shipped. |
| Function/migration/API credential gap | Deploy the reviewed missing backend version, reconcile migrations, or fix least-privilege service-account access as indicated by logs. | Backend/Cloud change; normally **no AAB** for server-only repair. |
| Native Billing/ProductDetails/option selection defect in installed AAB | Fix mobile implementation, verify dependency and merged manifest, build and upload a new tested AAB. | Mobile code/native artifact; **new AAB required**. |
| Worker/cron absent or failing | Deploy/schedule/recover the existing reviewed worker and monitor affected orders. | Backend/operations; normally **no AAB**. |

Changing price or SKU for an outstanding order is not a configuration-only shortcut. Existing prices stay unchanged. Do not implement automatic synchronization in Phase 0.

## 13. Recommended Next Implementation Phase

The next phase is a **targeted configuration and failure-correlation review**: complete sections 3–10; identify the installed build and one failed attempt; verify whether an order was created, whether Play returned purchased/pending, whether settlement occurred, and whether consumption is pending. If a paid order lacks a successful entitlement, treat it as an operational incident and reconcile under the payment team's approved procedure. After root cause and configuration are known, prepare a narrow, separately approved fix and licensed staging verification. Automatic Admin-to-Play price synchronization remains deferred.

## 14. Exact Files Potentially Requiring Changes

**Proposed only; none changed.** If evidence points to mobile Billing: `mobile-app/src/services/playBillingService.ts`, `mobile-app/src/services/playOfferSelection.ts`, `mobile-app/src/screens/payment/PlayBillingScreen.tsx`, `mobile-app/app.config.js`, `mobile-app/eas.json`. If it points to backend verification/recovery: `supabase/functions/create-play-order/index.ts`, `supabase/functions/verify-play-purchase/index.ts`, `supabase/functions/_shared/googlePlay.ts`, `supabase/functions/play-payment-worker/index.ts`, `supabase/config.toml`, `supabase/play_payment_cron_setup.sql`, and only a reviewed migration under `supabase/migrations/` if needed. If it is configuration-only, those source files may need no change; the relevant Console/hosted settings would be reviewed under separate approval. The checked-in `supabase/seed/play_price_tiers.json` is a future release artifact, not proof of live data.

## 15. Final GO / NO-GO Assessment

**NO-GO.** No existing price tier, Product ID mapping, license tester, backend deployment, worker recovery run, or completed licensed purchase was **VERIFIED LIVE**. The reported failure may be before or after a Play charge; that boundary is **NOT VERIFIED**. The smallest safe next action is to gather one redacted failed-attempt trace and read-only Console/Supabase inventory, then select the specific configuration or code remedy. Preserve the four owner prices. Stop here pending explicit approval for any implementation, configuration change, deployment, or purchase.
