# Real-device release test checklist

**Status: NOT TESTED.** No Android device was connected to the session that prepared this; every box below is unchecked and nothing may be reported as passed until a person runs it.
Build under test: the production AAB/APK from `eas build -p android --profile production` (record versionName/versionCode: ______ / ______). Device/Android version: ______ Tester: ______ Date: ______

Mark each: PASS / FAIL / N/A, with a note or screenshot for FAIL.

## Authentication
- [ ] Install from the build; first launch (onboarding, no crash)
- [ ] Sign up with a valid new account (name, email, mobile, compliant password)
- [ ] Invalid sign-up: weak password (`Abcdefgh1` rejected), existing email, existing mobile, bad mobile number
- [ ] Email confirmation link → opens `https://www.medveda.in/account-verified`; cannot log in before confirming
- [ ] Log in (email + password) and log in with mobile number
- [ ] Log out (returns to login; back button does not re-enter)
- [ ] Session persistence: kill and reopen the app → still signed in
- [ ] Session expiry: after sign-out on another device / revoked session, the app returns to login without a crash
- [ ] Forgot password (email and mobile) → mail → `https://www.medveda.in/reset-password` → "Open app" → new password → can log in; old password no longer works
- [ ] Deep link `ayurpulse://reset-password#…` opens the app on the reset screen; an expired/used link shows a clear error
- [ ] Account switching: log out, log in as another user → no data from the first user (profile, downloads, purchases, notes)

## Content
- [ ] Home, courses, years/subjects/chapters render for the chosen course
- [ ] Notes list; open a PDF (free and purchased); an unpurchased paid note is locked
- [ ] Chapter details; quiz start/finish; videos open (free)
- [ ] Download a note; open it offline (airplane mode)
- [ ] Offline wipe: log out → downloaded files and cached data are gone; new login does not see them

## Payment (use the ₹1 controlled test — see `RAZORPAY_PRODUCTION_SETUP.md`)
- [ ] Product screen and order summary show the server's price
- [ ] Referral discount applied only when eligible; total matches what Razorpay charges
- [ ] Razorpay checkout opens (no "TEST MODE" banner); pay via UPI (GPay/PhonePe/Paytm app switch and return)
- [ ] Payment success → content unlocks within seconds; purchase appears in My Purchases
- [ ] Payment failure (decline / wrong PIN) → clear message, no access, can retry
- [ ] Cancel at checkout → no charge, no access, order not left "paid"
- [ ] Duplicate callback (background the app right after paying, reopen; retry Verify) → still exactly one purchase
- [ ] Webhook delivered (Razorpay dashboard: 2xx) and order shows `paid` in the DB
- [ ] Cannot buy the same product twice ("already own")

## Wallet
- [ ] Balance shown correctly; credit appears only after the friend's payment settles
- [ ] Debit at checkout (notes only) reduces the amount charged; balance drops once
- [ ] Double-tap Pay / duplicate request → one order, one debit
- [ ] Two devices ordering at once with the same wallet → balance never negative
- [ ] Refund of the test payment → access revoked, referral credit reversed once
- [ ] Settlement: ledger entries equal what the admin panel shows

## Referral
- [ ] Valid referral code applied at signup/checkout
- [ ] Own code → rejected
- [ ] Applying a second referral code → rejected
- [ ] Reward credited to the referrer after the friend's purchase; friend discount single-use
- [ ] Refund interaction: reward reversed, no double reversal

## Security
- [ ] Deep links from a browser/other app cannot open screens that need login without logging in; malformed `ayurpulse://` links do not crash the app
- [ ] After logout, screens behind login are unreachable
- [ ] A student cannot see admin data or any other user's purchases/profile
- [ ] Admin panel (browser): admin logs in with MFA; student account refused
- [ ] Screenshot/recording of note PDFs is blocked (or behaves as designed)
- [ ] Network loss mid-browse and mid-payment: friendly errors, no crash, recovers on reconnect
- [ ] App restart during/after payment resumes correctly
- [ ] `adb shell dumpsys package com.ayurpulse.app | grep -i "debuggable\|allowBackup"` → not debuggable, backup off
