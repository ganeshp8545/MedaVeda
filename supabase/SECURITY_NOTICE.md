# SECURITY NOTICE — Action Required Before Next Deploy

## What happened
`supabase/functions/.env` had a REAL Razorpay key pair committed in plaintext:
- RAZORPAY_KEY_ID=rzp_test_REDACTED
- RAZORPAY_KEY_SECRET=REDACTED_SECRET

This file has been removed from this delivery and replaced with `.env.example`
(placeholder only). A `.gitignore` has been added so a real `.env` never gets
committed again.

## Why this matters for your payment bug
The key above is a **TEST mode** key (`rzp_test_` prefix). If this same key is
what's currently set as your production Edge Function secret
(`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` on the deployed Supabase project),
your app is creating **test-mode Razorpay orders in production**. Real UPI
apps (PhonePe/GPay) do not behave the same way against test-mode orders as
they do against live orders — this is a strong candidate for why the
success callback / verification flow has been unreliable.

## What YOU must do manually (I cannot do this for you — I don't have your real keys)

1. Check what's actually deployed right now:
   ```
   supabase secrets list
   ```
2. Go to the Razorpay Dashboard → confirm whether you're meant to be Live or
   still testing.
3. If you should be LIVE:
   - Generate/copy your **Live** Key ID and Key Secret from Razorpay Dashboard
     → Settings → API Keys (switch the toggle to "Live mode" first).
   - Set them on Supabase:
     ```
     supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
     supabase secrets set RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
     ```
4. **Rotate the leaked test key regardless** — since it was committed to a
   zip/repo, treat it as compromised:
   - Razorpay Dashboard → API Keys → regenerate the test key pair, even if
     you keep using test mode for staging.
5. Confirm your real `.git` history — if this repo was ever pushed to
   GitHub/GitLab with `.env` committed, the key is in git history even after
   deleting the file now. You may need:
   ```
   git log --all --full-history -- supabase/functions/.env
   ```
   and, if found, scrub it (e.g. `git filter-repo`) or just treat the keys as
   permanently burned and rotate them.
6. Never re-add `supabase/functions/.env` to git. Use `.env.example` as the
   template and keep the real `.env` local-only (already covered by the
   `.gitignore` added here).
