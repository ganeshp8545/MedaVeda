# MedVeda India user choice billing setup

Status: implementation checklist, 2026-10-13. **Do not release the UCB build until every release gate below is verified with production console settings and a Play-installed licensed tester.** Code alone cannot establish enrollment, tax accuracy, SKU prices or service-account access.

**Release gate: remove the ₹1 test tier and re-price all products before production.** The checked-in `notes_1` tier is temporary and inactive. Replace it with the verified live price inventory; never activate the test tier in production.

## 1. Confirm the package and enroll in India

1. In Play Console, open the MedVeda app and verify its package is **`in.medveda.app`**, as configured in `mobile-app/app.json` and required by the local server Play configuration. Confirm the deployed Supabase secret `GOOGLE_PLAY_PACKAGE_NAME` is also `in.medveda.app` before making SKUs or uploading a build.
2. Open **Settings → Alternative billing**. Complete the **India** user choice billing onboarding, accept the applicable terms, and set up the requested payments profile. India is a separate program from the general user choice billing pilot.
3. Complete Google's trust and safety requirements, including PCI DSS certification as Play requests and a way for users to report fraudulent alternative-billing transactions. Upload the Razorpay payment-method logo and opt `in.medveda.app` in for India. Wait for Google's onboarding confirmation and follow its app-specific instructions.
4. Keep Google Play Billing available alongside Razorpay. The choice dialog is rendered by the Play Billing Library on eligible India Play accounts; a Play account outside an eligible market may see only the standard Play sheet.

Sources: [India program and enrollment](https://support.google.com/googleplay/android-developer/answer/13306652), [Play's user choice integration](https://developer.android.com/google/play/billing/alternative/alternative-billing-with-user-choice-in-app).

## 2. Obtain the live price-tier inventory — RELEASE GATE

The checked-in source has **no trustworthy inventory of live product prices**. Its one inactive `notes_1` tier is a temporary test placeholder. Run a read-only query against the production Supabase project, review the result with the admin-panel product catalog, and record every active paid price and currency:

```sql
select price, count(*) from public.products
where active and price > 0
group by price order by price;
```

Confirm the real column names and whether `price` is stored as rupees or paise before using this query. Do not infer the inventory from example tiers (`notes_49`, `notes_99`, etc.). Enter only the reviewed whole-INR prices into [`supabase/seed/play_price_tiers.json`](../supabase/seed/play_price_tiers.json), removing `notes_1` unless ₹1 is independently verified as a real production price. Run `node supabase/seed/apply-play-price-tiers.mjs --dry-run` for validation and SQL preview, then run `DATABASE_URL=... node supabase/seed/apply-play-price-tiers.mjs --apply` from a secure shell to upsert **inactive** tiers. The script never activates a SKU **and never deletes old rows**. If the temporary row was applied in a database, remove it in SQL Editor with `delete from public.play_price_tiers where price_inr=1 and play_sku='notes_1' and active=false;`, then query the table to verify removal. If live product prices include fractional rupees, stop and revise the tier naming/seed validator before launch; do not round prices.

For each actual tier, create one **one-time, consumable** Play product in **Play Console → Monetize with Play → Products → One-time products**, using the exact SKU and Indian price from the server's tier mapping. After checking the Play price and product availability, set only that tier's `public.play_price_tiers.active=true` in Supabase. A product without an active exact tier gets a clear `price_tier_missing` error and cannot start Play checkout. Test two different notes at the same tier. Tier SKUs need server-side consumption after a verified grant so the same tester can buy another product at that tier. Never silently pick a nearby price.

Record the final inventory here before release:

| Server price (INR) | Play SKU | Play INR price | Active product count | Verified by / date |
|---|---|---|---:|---|
| **Pending live database and Play Console check** |  |  |  |  |

Sources: [Google Play purchase processing and consumption](https://developer.android.com/google/play/billing/integrate), [expo-iap Android transaction handling](https://hyochan.github.io/expo-iap/api/methods/android-specific/).

## 3. Configure tax snapshots and buyer-selected state — RELEASE GATE

Google requires the authorized Razorpay transaction's **actual pre-tax amount, tax amount, transaction time and user tax address** in its external transaction report. Its API marks `administrativeArea` required for India. The owner confirmed the present GST rate is **0%** and approved a required buyer-selected Indian state before Android Razorpay checkout. Configure `app_config.gst_rate_percent=0` and leave `seller_state` unset until the real value is supplied. The backend must snapshot the configured rate and buyer state on the order at checkout: at today's rate, `pre_tax=actual Razorpay amount` and `tax=0`. Do not recalculate from a later configuration change. If the configured rate changes, the server must calculate and snapshot its real pre-tax/tax split according to the business's reviewed tax rules before enabling that rate. The report must use the **actual amount authorized after referral discount and wallet use**, not list price. Do not guess the buyer state or submit a report with it missing.

Before enabling Razorpay UCB, confirm the Android checkout requires a valid state from Google's accepted India administrative-area values, stores it server-side with the settled transaction, and that `externaltransactions.createexternaltransaction` accepts a licensed test report with the snapshotted 0% tax values. A buyer who declines the state selection cannot continue the Razorpay branch. The buyer state is required for Play reporting even while the configured tax rate is 0%; `seller_state` remains unset because it is not a substitute for buyer state.

Source: [Google external transaction backend guide](https://developer.android.com/google/play/billing/outside-gpb-backend), [external transaction resource](https://developers.google.com/android-publisher/api-ref/rest/v3/externaltransactions).

## 4. Configure Google Play Developer API access

1. In Google Cloud Console, create or choose a project and enable **Google Play Developer API**.
2. Create a dedicated service account in that project. In **Play Console → Users and permissions → Invite new users**, invite its email for this app with **View financial data, orders, and cancellation survey responses** and **Manage orders and subscriptions**. Google's current API setup guide lists both permissions for Billing APIs. Use the minimum app scope available in the Console.
3. Securely export a key only if the deployed server implementation requires a JSON key. Set it as the Supabase secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`; do not put JSON, a private key or an access token in git, EAS variables, `EXPO_PUBLIC_*`, or a client build. Set `GOOGLE_PLAY_PACKAGE_NAME=in.medveda.app` in Supabase. Ensure the server authenticates with the `https://www.googleapis.com/auth/androidpublisher` scope.
4. Confirm `purchases.products.get`, purchase consumption, and `externaltransactions.createexternaltransaction` work for a licensed test purchase. The external report ID must be stable, unique per app, 1–63 characters from `[A-Za-z0-9_-]`, and contain no personal information. Do not mark a report complete until Google confirms it.

Source: [Google Play Developer API getting started](https://developers.google.com/android-publisher/getting_started), [external transaction create method](https://developers.google.com/android-publisher/api-ref/rest/v3/externaltransactions/createexternaltransaction).

## 5. Set server secrets and deploy functions

Set these in **Supabase Dashboard → Project Settings → Edge Functions → Secrets** (or equivalent current CLI workflow), using the exact names consumed by the implementation. The values below are **names**, not credentials:

| Name | Where | Purpose |
|---|---|---|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Supabase secret | Server-only Google Developer API credential. |
| `GOOGLE_PLAY_PACKAGE_NAME` | Supabase secret | Expected package `in.medveda.app`. |
| `UCB_REPORT_CRON_SECRET` | Supabase secret | Authenticates the scheduled report retry endpoint if it uses an HTTP trigger. Set a long random value. |
| `UCB_SENTRY_DSN` | Supabase secret | Server-side Sentry event reporting for failed external reports and purchase-consumption retries. Set the backend project's DSN; keep it out of client bundles. |
| `RAZORPAY_KEY_ID` | Existing Supabase secret | Server-side Razorpay order creation. |
| `RAZORPAY_KEY_SECRET` | Existing Supabase secret | Server-side Razorpay API and signature verification. |
| `RAZORPAY_WEBHOOK_SECRET` | Existing Supabase secret | Razorpay webhook signature verification. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase platform/server secret | Server-only settlement and reporting; never expose to the app. |
| `GOOGLE_SERVICES_JSON` | Existing EAS file secret, if needed | Firebase/notification config only; **not** the Play Developer API credential. |

`UCB_SENTRY_DSN` is for Supabase Edge Functions. It is distinct from the
optional mobile build variable `EXPO_PUBLIC_SENTRY_DSN`; setting the mobile
variable does not turn on backend alerts. Configure the backend DSN and verify
a controlled failure reaches the intended Sentry project before launch.

Check actual deployed function code for any additional secret name and add it to this table before deploying. Apply all three reviewed UCB SQL migrations first, including the per-refund queue. Deploy authenticated `create-play-order`, `verify-play-purchase`, and `attach-external-token` with JWT verification. Keep `razorpay-webhook` deployed with `--no-verify-jwt`; its Razorpay signature check remains mandatory. Enable Razorpay `payment.captured`, `refund.processed`, and the existing dispute events on the webhook. Protect server-only `report-external-transaction` and its scheduled retry with the configured secret. Confirm report retries run often enough to meet the **24-hour-from-authorization** deadline and alert on failures. Each processed UCB Razorpay refund is queued with its Razorpay refund ID; partial refunds use Google's `partialRefund`, while a full refund reports the remainder with `fullRefund`.

**Required launch switch:** `app_config.require_ucb_for_razorpay` starts as `false` for migration. Per the release sequence, keep it `false` through internal testing and change it to `true` **only after the new app version is live**. Do this immediately after verifying live availability, then confirm a direct authenticated `create-order` call without a bound UCB order is rejected. This is a server-wide gate; a client platform header cannot prove Android versus iOS. The new app hides non-Android purchase controls, as the project requirements allow. Older app versions receive the server's update/start-choice error when trying to purchase. The checked-in UCB binary declares version **1.2.0**; confirm its final installed version is newer than the live build, then set `app_config.min_app_version` to that UCB version and verify the installed-version update gate on an older binary before enabling the launch switch. Until the switch is enabled, a modified or old Android client can reach Razorpay without Play's choice screen; treat the interval as an active release risk and monitor it closely. Do not claim server-side enforcement while the switch is off.

After the functions and Supabase secrets are deployed, create Supabase Vault secrets named `ucb_project_url` (this project's HTTPS URL) and `ucb_report_cron_secret` (the same value as `UCB_REPORT_CRON_SECRET`). Review and run [`supabase/ucb_cron_setup.sql`](../supabase/ucb_cron_setup.sql) in the hosted SQL editor. It uses `pg_cron` and `pg_net` for four independent one-minute jobs: external reports, refund reports, Play consumption, and Play void checks. Each call handles at most one network-heavy item and has a 90-second HTTP timeout. Verify all four jobs appear in `cron.job`, execute successfully, and produce the expected phase-specific result. Monitor queue depth; each phase handles at most 1,440 items per day at this schedule, so raise capacity if live volume approaches that rate. The local scratch database does not have `pg_net`, so this scheduled invocation is a hosted release gate.

Source: [external reporting lifecycle and refunds](https://developer.android.com/google/play/billing/outside-gpb-backend), [refund API](https://developers.google.com/android-publisher/api-ref/rest/v3/externaltransactions/refundexternaltransaction).

## 6. Build a native Android binary and enroll testers

`expo-iap` includes native code; **Expo Go cannot test this flow**. After dependency and config changes, build a fresh native binary. `mobile-app/eas.json` has a `development` APK profile, a separate `internal-testing` AAB profile for Play's internal track, and a `production` AAB profile. Run the internal testing build only after `npx expo-doctor` passes and the EAS remote Android version code is higher than the latest Play artifact:

```bash
cd mobile-app
npx eas-cli build --platform android --profile internal-testing
npx eas-cli submit --platform android --profile internal-testing --latest
```

For real Play Billing tests, upload the AAB to **Play Console → Test and release → Testing → Internal testing** and install through the Play opt-in link using an Indian Play account on an eligible device. Add the tester to **Play Console → Settings → License testing** as well; internal testers otherwise pay for in-app products. Add a verified MedVeda test student in **App content → App access** with instructions to reach Notes checkout, including an unlocked note for review without payment. Never publish the password in this repository.

Sources: [Expo native development builds](https://docs.expo.dev/develop/development-builds/faq/), [Play internal testing](https://support.google.com/googleplay/android-developer/answer/9845334), [license testing](https://support.google.com/googleplay/android-developer/answer/6062777).

## 7. Prove the three checkout paths before release

1. **Play:** From a paid note, verify the Play choice sheet and choose Play. Complete a licensed test purchase, check one grant and one referral qualification, and confirm server verification and consumption. Simulate a temporary Google consume failure after the grant; the server retry must consume the same token without granting twice and alert through backend Sentry if the retry fails. Buy a second different note at the same tier; it must succeed. Kill/reopen the app during confirmation and check recovery without a duplicate grant.
2. **Razorpay:** Choose the alternative payment option, then run the existing OrderSummary and WebView checkout with referral discount and partial wallet. Check the captured amount, one grant, bound external token, tax/state source, one Google external report within 24 hours, and successful reconciliation on repeated callbacks/webhooks. Test a partial refund: access remains, its stable Razorpay refund ID is reported once to Google, and a retry does not reduce Google's current pre-tax balance twice. Then complete the refund: access is revoked and Google shows `TRANSACTION_CANCELED`.
3. **Cancel/fail/pending:** Cancel at the choice sheet and during provider checkout; simulate failed Razorpay and delayed Play purchase. Check no premature entitlement, no duplicate payment/grant/report, and clear recovery UI. Test iOS behavior separately without Android Billing calls.

Finally, reconcile the release build against `mobile-app/DATA_SAFETY_AUDIT.md`, update the Play Data safety answers and the live privacy/terms/refund pages, and verify the UCB enrollment, state/tax snapshot and SKU gates again. Submit only after the backend and native build pass the tests above.
