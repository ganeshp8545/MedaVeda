# MedVeda — Complete Installation & Setup Guide

> **Project:** MedVeda  
> **Mobile App:** Expo + React Native + TypeScript  
> **Admin Panel:** React + Vite + TypeScript + Tailwind CSS  
> **Backend:** Supabase + PostgreSQL + Edge Functions  
> **Payments:** Razorpay  
> **Push Notifications:** Expo Notifications  
> **Build/Release:** EAS Build

---

## 1. Project Structure

After extracting the ZIP, the main structure is:

```text
MedVeda_Source_Code/
│
├── mobile-app/                  # React Native / Expo mobile application
│   ├── src/
│   ├── assets/
│   ├── App.tsx
│   ├── app.json
│   ├── eas.json
│   ├── package.json
│   └── ...
│
├── admin-panel/                 # React + Vite admin dashboard
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   └── ...
│
├── supabase/                    # Main Supabase backend
│   ├── migrations/
│   ├── functions/
│   └── config.toml
│
└── README.md
```

---

# 2. Required Software

Install the following before starting.

### Required

- **Node.js:** 20 LTS recommended
- **npm:** Comes with Node.js
- **Git:** Recommended
- **Supabase account/project**
- **Razorpay account** if payments are required
- **Expo/EAS account** for mobile builds

### Optional

- Android Studio — only if you want a local Android emulator/build environment
- VS Code — recommended code editor

Check installation:

```bash
node -v
npm -v
git --version
```

---

# 3. Extract the Project

Extract:

```text
MedVeda_Source_Code.zip
```

Open the extracted project:

```bash
cd MedVeda_Source_Code
```

Do **not** rename or move the `mobile-app`, `admin-panel`, or `supabase` folders unless you also update paths/configuration.

---

# 4. Supabase Backend Setup

The project uses Supabase for:

- Authentication
- PostgreSQL database
- Row Level Security
- Products
- Orders
- Purchases
- User profiles
- Quiz data
- Bookmarks
- Reading progress
- Payment sessions
- Payment records
- Razorpay payment verification
- Razorpay webhook
- Push notification backend functions

---

## 4.1 Create / Select Supabase Project

Create a Supabase project or use the existing project.

You will need:

```text
Project URL
Publishable/Anon Key
Project Reference ID
```

The current project configuration contains an existing Supabase project reference. If you are installing this for a different customer/project, replace the old project configuration with the new project's values.

---

# 5. Install Supabase CLI

From the project root:

```bash
npx supabase --version
```

If it is not available, use the Supabase CLI through `npx`:

```bash
npx supabase login
```

A browser will open. Log in to the Supabase account that owns or has sufficient permissions on the project.

---

# 6. Link the Supabase Project

From the project root:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

Example:

```bash
npx supabase link --project-ref your-project-ref
```

Enter the database password if requested.

Verify the linked project:

```bash
npx supabase status
```

---

# 7. Apply Database Migrations

The ZIP contains these important migrations:

```text
supabase/migrations/
├── 20260718_payment_backend.sql
├── 20260721_admin_orders_purchases_access.sql
├── 20260801_auth_verified_identities.sql
├── 20260801150000_razorpay_webhook_atomic_grant.sql
├── orders_purchases_rls.sql
└── push_tokens.sql
```

Push the migrations:

```bash
npx supabase db push
```

### Important

If this is an **existing production database**, first inspect the migration history and database before running destructive/manual SQL.

Do not blindly delete existing tables.

---

# 8. Supabase Authentication Setup

Open:

```text
Supabase Dashboard
→ Authentication
```

Configure the authentication providers required by the app.

The app supports Supabase authentication and the source contains logic for identifier-based login.

For email/password authentication, configure:

```text
Authentication
→ Providers
→ Email
```

Enable the options required by your production authentication policy.

If email confirmation is enabled, configure the required email provider/SMTP before expecting production emails to work reliably.

---

# 9. Mobile Phone Login Function

The source contains:

```text
supabase/functions/login-with-mobile/index.ts
```

This function handles phone-number/password login by:

1. Normalizing the phone number.
2. Looking up the corresponding profile.
3. Resolving the user's email.
4. Signing in through Supabase Auth.
5. Returning the authenticated session.

Deploy it if your app uses phone/password login:

```bash
npx supabase functions deploy login-with-mobile
```

If this function is not intended to be used in your current build, it does not need to be deployed.

---

# 10. Supabase Edge Functions

The main backend contains:

```text
supabase/functions/
├── create-payment-session/
├── pay/
├── verify-payment/
├── razorpay-webhook/
└── send-push-notification/
```

Deploy them individually:

```bash
npx supabase functions deploy create-payment-session
npx supabase functions deploy pay
npx supabase functions deploy verify-payment
npx supabase functions deploy razorpay-webhook
npx supabase functions deploy send-push-notification
```

The `supabase/config.toml` already contains important JWT verification configuration for the payment/webhook/notification functions.

Do not randomly enable/disable JWT verification without understanding the function flow.

---

# 11. Razorpay Setup

Razorpay is used for payment processing.

You need:

```text
Razorpay Key ID
Razorpay Key Secret
Razorpay Webhook Secret
```

There are separate **Test** and **Live** credentials.

### Testing

Use:

```text
rzp_test_...
```

### Production

Use:

```text
rzp_live_...
```

Never put the Razorpay secret key inside the mobile app or admin-panel frontend.

---

# 12. Supabase Razorpay Secrets

Set the production secrets using the Supabase CLI.

### Test mode

```bash
npx supabase secrets set \
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxx \
RAZORPAY_KEY_SECRET=xxxxxxxxx \
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxx \
APP_ENV=staging
```

### Live mode

```bash
npx supabase secrets set \
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxx \
RAZORPAY_KEY_SECRET=xxxxxxxxx \
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxx \
APP_ENV=production
```

Check configured secrets:

```bash
npx supabase secrets list
```

> The actual secret values should never be committed to GitHub or included in the source-code ZIP.

---

# 13. Razorpay Webhook

In Razorpay Dashboard, configure a webhook pointing to:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/razorpay-webhook
```

Use the same webhook secret that you stored as:

```text
RAZORPAY_WEBHOOK_SECRET
```

The webhook is separate from:

```text
RAZORPAY_KEY_SECRET
```

Do not use the Razorpay API secret as the webhook secret.

---

# 14. Payment Flow

The current backend payment flow is approximately:

```text
Mobile App
    │
    ▼
create-payment-session
    │
    ▼
Short-lived payment session
    │
    ▼
pay
    │
    ▼
Razorpay Checkout
    │
    ▼
Razorpay Payment
    │
    ├──────────────► Razorpay Webhook
    │
    ▼
verify-payment
    │
    ▼
Purchase verification
    │
    ▼
Product unlocked
```

Test this entire flow before switching to live Razorpay credentials.

---

# 15. Mobile App Installation

Go into the mobile app:

```bash
cd mobile-app
```

Install dependencies:

```bash
npm ci
```

If `npm ci` reports a lockfile mismatch, use:

```bash
npm install
```

Start Expo:

```bash
npx expo start
```

---

# 16. Mobile App Environment Variables

The app uses:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

These are referenced by:

```text
mobile-app/src/config/supabase.ts
```

For local development, create:

```text
mobile-app/.env
```

Example:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

### Important

Only public/publishable client credentials belong here.

Never put these into the mobile app:

```text
SUPABASE_SERVICE_ROLE_KEY
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
```

---

# 17. EAS Environment Configuration

The existing:

```text
mobile-app/eas.json
```

contains environment variables for development, preview and production builds.

Before creating your own production build, verify that:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

point to the correct Supabase project.

If you are transferring the project to another customer, replace the old project's values.

---

# 18. Run Mobile App

From:

```bash
cd mobile-app
```

Run:

```bash
npx expo start
```

### Android

```bash
npx expo start --android
```

or, for a native Android development build:

```bash
npx expo run:android
```

### Web

```bash
npm run web
```

---

# 19. Admin Panel Installation

Open another terminal.

From the project root:

```bash
cd admin-panel
```

Install dependencies:

```bash
npm ci
```

If necessary:

```bash
npm install
```

---

# 20. Admin Panel Environment Variables

The admin panel uses:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Create:

```text
admin-panel/.env.local
```

Example:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Do not put:

```text
SUPABASE_SERVICE_ROLE_KEY
RAZORPAY_KEY_SECRET
```

into the Vite frontend environment.

---

# 21. Run Admin Panel

From:

```bash
cd admin-panel
```

Run:

```bash
npm run dev
```

Vite will show a local URL, normally similar to:

```text
http://localhost:5173
```

Open that URL in your browser.

---

# 22. Admin Authentication

The admin panel contains authentication/security logic.

The project also contains:

```text
admin-panel/README.md
```

Follow that file for the exact admin-account setup used by the current codebase.

If the deployed version uses Supabase admin authorization, configure the appropriate admin role/records in Supabase.

The admin panel signs in with Supabase Auth only; the old Firebase setup notes were removed (see `admin-panel/README.md`).

---

# 23. Database Security / RLS

This project relies heavily on PostgreSQL Row Level Security.

Important tables include areas such as:

```text
profiles
products
orders
purchases
push_tokens
payment_sessions
payments
quiz_attempts
bookmarks
reading_progress
watch_history
```

Do not disable RLS globally to "fix" permission errors.

Instead:

1. Identify the failing table.
2. Check its RLS policies.
3. Check whether the request is authenticated.
4. Check whether the correct user/admin role is being used.
5. Update the policy only when required.

---

# 24. Push Notifications

The backend contains:

```text
supabase/functions/send-push-notification/
```

Deploy:

```bash
npx supabase functions deploy send-push-notification
```

The mobile app stores push tokens in the database.

Required permission on Android is already referenced in:

```text
mobile-app/app.json
```

The user must grant notification permission on the device.

---

# 25. Sentry

The mobile app contains:

```text
mobile-app/src/config/sentry.ts
```

It can use:

```env
EXPO_PUBLIC_SENTRY_DSN=YOUR_SENTRY_DSN
```

If Sentry is not being used, leave the value unset according to the existing application logic.

Do not commit private Sentry credentials.

---

# 26. Offline Mode

The project contains offline functionality using:

```text
expo-sqlite
@react-native-community/netinfo
expo-file-system
```

The related documentation is:

```text
mobile-app/OFFLINE_MODE_SETUP.md
```

If the current ZIP already contains the offline implementation, no additional installation is required beyond:

```bash
npm ci
```

The offline system can handle local downloads and synchronization according to the implementation in the source.

---

# 27. Production Build

Before production build, verify:

- Correct Supabase project
- Correct app package name
- Correct Razorpay credentials
- Database migrations applied
- Edge Functions deployed
- Authentication tested
- Admin panel tested
- Payment flow tested
- Push notifications tested
- Privacy/terms/delete-account pages available if required
- App icon and splash assets are correct

---

# 28. EAS Login

From:

```bash
cd mobile-app
```

Run:

```bash
npx eas login
```

Check:

```bash
npx eas whoami
```

---

# 29. Initialize EAS

If this project is being connected to a new Expo/EAS account:

```bash
npx eas init
```

Then:

```bash
npx eas build:configure
```

The current `app.json` already contains an EAS project ID. For a new owner/project, verify that the ID belongs to the correct Expo project.

---

# 30. Test APK Build

Create an installable Android APK:

```bash
npx eas build --platform android --profile preview
```

After the build finishes, install the APK on a physical Android device and test:

```text
Launch
↓
Register/Login
↓
Home
↓
Years
↓
Subjects
↓
Notes/Videos/Quiz
↓
Product/Purchase
↓
Razorpay
↓
Payment verification
↓
Content unlock
↓
Logout/Login again
```

---

# 31. Production AAB Build

Google Play Store requires an Android App Bundle for normal production submission.

Run:

```bash
npx eas build --platform android --profile production
```

The generated file will be:

```text
.aab
```

EAS can manage Android signing credentials.

---

# 32. App Package Name

Current `mobile-app/app.json` contains:

```json
"android": {
  "package": "in.medveda.app"
}
```

If this is a new app, choose the final package name before publishing.

Example:

```text
com.company.medveda
```

The Android package/application ID should be treated as permanent once the app is published.

---

# 33. App Name

The current Expo configuration contains:

```json
"name": "MedVeda"
```

The package/slug may still contain older AyurPulse naming:

```json
"slug": "ayurpulse"
```

If the final branding is MedVeda, review all branding-related fields and assets before release.

Do not change package IDs casually after Play Store publication.

---

# 34. Version Code

The current Android configuration contains:

```json
"versionCode": 3
```

For every Android release, the version code must increase.

The production EAS profile has:

```json
"autoIncrement": true
```

so EAS can manage version increments according to the configured build process.

---

# 35. Admin Panel Production Build

From:

```bash
cd admin-panel
```

Build:

```bash
npm run build
```

The output will normally be:

```text
admin-panel/dist/
```

Preview locally:

```bash
npm run preview
```

---

# 36. Admin Panel Deployment

The admin panel is a Vite application and can be deployed to platforms such as:

- Vercel
- Netlify
- Cloudflare Pages
- Any static hosting service

When deploying, configure:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Do not expose service-role or secret credentials in Vite environment variables.

---

# 37. SPA Routing Configuration

Because the admin panel uses React Router, production hosting must support SPA fallback.

For example, a request such as:

```text
/admin
/login
/privacy
/terms
```

should serve:

```text
index.html
```

instead of returning a server-side 404.

Configure the selected hosting provider for SPA rewrites/fallback.

---

# 38. Production Verification

After deployment, test the admin panel:

```text
/login
/dashboard
/products
/orders
/purchases
/users
/settings
```

Use the actual routes present in the current source code.

Test:

```text
Login
Logout
Protected routes
Product creation
Product editing
Orders
Purchases
Notifications
```

---

# 39. Full First-Time Installation — Quick Command List

## Backend

From project root:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Deploy functions:

```bash
npx supabase functions deploy login-with-mobile
npx supabase functions deploy create-payment-session
npx supabase functions deploy pay
npx supabase functions deploy verify-payment
npx supabase functions deploy razorpay-webhook
npx supabase functions deploy send-push-notification
```

Set secrets:

```bash
npx supabase secrets set RAZORPAY_KEY_ID=YOUR_KEY_ID
npx supabase secrets set RAZORPAY_KEY_SECRET=YOUR_KEY_SECRET
npx supabase secrets set RAZORPAY_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET
npx supabase secrets set APP_ENV=staging
```

---

## Mobile

```bash
cd mobile-app
npm ci
npx expo start
```

Production build:

```bash
npx eas login
npx eas build --platform android --profile preview
npx eas build --platform android --profile production
```

---

## Admin

```bash
cd admin-panel
npm ci
npm run dev
```

Production:

```bash
npm run build
```

---

# 40. Recommended Installation Order

Follow this exact order for a clean setup:

```text
1. Install Node.js
        ↓
2. Extract source code
        ↓
3. Create/choose Supabase project
        ↓
4. Link Supabase CLI
        ↓
5. Apply database migrations
        ↓
6. Configure Supabase Auth
        ↓
7. Deploy Edge Functions
        ↓
8. Configure Razorpay
        ↓
9. Set Supabase Razorpay secrets
        ↓
10. Configure Razorpay webhook
        ↓
11. Configure mobile environment
        ↓
12. npm ci in mobile-app
        ↓
13. Test mobile app
        ↓
14. Configure admin environment
        ↓
15. npm ci in admin-panel
        ↓
16. Test admin panel
        ↓
17. Test admin → database
        ↓
18. Test mobile → database
        ↓
19. Test complete payment flow
        ↓
20. Create preview APK
        ↓
21. Test APK on physical device
        ↓
22. Configure production credentials
        ↓
23. Create production AAB
        ↓
24. Publish to Google Play
```

---

# 41. Environment Variables Checklist

## Mobile App

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_SENTRY_DSN=
```

Only add variables that are actually used by the current build.

---

## Admin Panel

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

---

## Supabase Edge Functions

```env
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
APP_ENV=production
```

Supabase automatically provides its internal function environment variables such as the project URL/service-role environment needed by the backend.

---

# 42. Security Rules

## NEVER commit these

```text
.env
.env.local
supabase/functions/.env
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
SUPABASE_SERVICE_ROLE_KEY
Google Play service account JSON
private signing credentials
```

## Safe to expose to client apps

A Supabase publishable/anon key is designed for client-side use when database RLS is correctly configured.

Still, never use it as a replacement for RLS policies.

---

# 43. Important Security Warning

The source package contains a security notice:

```text
supabase/SECURITY_NOTICE.md
```

It documents that an earlier Razorpay test key was present in source history.

Treat any previously committed secret as compromised.

If a real key was ever committed to Git/GitHub:

1. Rotate the Razorpay key.
2. Rotate any other exposed secret.
3. Check Git history.
4. Remove secrets from Git history if required.
5. Never reuse an exposed production secret.

Use:

```bash
git log --all --full-history -- supabase/functions/.env
```

to check whether the file existed in Git history.

---

# 44. Common Errors

## Error: `npm` not found

Install Node.js and reopen the terminal.

Check:

```bash
node -v
npm -v
```

---

## Error: `supabase command not found`

Use:

```bash
npx supabase --version
```

and:

```bash
npx supabase login
```

---

## Error: Supabase permission denied

The Supabase account must have sufficient project permissions for:

- Database migrations
- Edge Function deployment
- Secrets management

Ask the project owner to grant the required role if the account is only a developer/member without the necessary permissions.

---

## Error: 401 from Edge Function

Check:

```text
supabase/config.toml
```

and determine whether the function is expected to use:

```text
JWT verification
```

or its own authentication/signature validation.

Do not simply disable security checks to hide the error.

---

## Error: Payment does not unlock

Check in this order:

```text
Razorpay order
↓
Payment ID
↓
Signature
↓
verify-payment
↓
Webhook
↓
orders table
↓
purchases table
↓
Product ownership
```

Also verify whether Test or Live Razorpay credentials are being used.

---

## Error: Admin panel shows blank/connection error

Check:

```env
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Then restart Vite:

```bash
npm run dev
```

After changing Vite environment variables, a restart is required.

---

## Error: Mobile app cannot connect to Supabase

Check:

```env
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

Then restart Expo:

```bash
npx expo start -c
```

---

## Error: Android build fails

Run:

```bash
cd mobile-app
npm ci
npx expo doctor
```

Then:

```bash
npx eas build --platform android --profile preview
```

Resolve the first actual error before changing unrelated dependencies.

---

# 45. Production Go-Live Checklist

## Supabase

- [ ] Correct production project selected
- [ ] All migrations applied
- [ ] RLS enabled
- [ ] Auth configured
- [ ] Edge Functions deployed
- [ ] Function secrets configured
- [ ] No secrets committed

## Razorpay

- [ ] Test payment completed
- [ ] Webhook configured
- [ ] Webhook secret configured
- [ ] Live API keys generated
- [ ] Live keys stored only in Supabase secrets
- [ ] Test keys rotated if previously exposed
- [ ] Live payment tested with a controlled transaction

## Mobile

- [ ] App name correct
- [ ] Package name final
- [ ] Icon correct
- [ ] Splash screen correct
- [ ] Supabase production URL correct
- [ ] Authentication tested
- [ ] Notes tested
- [ ] Videos tested
- [ ] Quiz tested
- [ ] Payment tested
- [ ] Purchase unlock tested
- [ ] Push notifications tested
- [ ] Offline functionality tested if enabled
- [ ] Preview APK tested

## Admin Panel

- [ ] Production Supabase URL configured
- [ ] Admin authentication tested
- [ ] Protected routes tested
- [ ] Product management tested
- [ ] Orders tested
- [ ] Purchases tested
- [ ] Notifications tested
- [ ] Production build succeeds
- [ ] SPA routing configured

## Google Play

- [ ] Developer account ready
- [ ] Identity verification complete
- [ ] Privacy Policy URL
- [ ] Terms URL
- [ ] Account deletion URL if applicable
- [ ] App screenshots
- [ ] Feature graphic
- [ ] App icon
- [ ] Data Safety form
- [ ] Content rating
- [ ] Store description
- [ ] Production AAB
- [ ] Test account/review credentials if required

---

# 46. Final Recommended Test

Before giving the project to a customer or publishing it, perform this complete test:

```text
Admin creates Product
        ↓
Product appears in Mobile App
        ↓
Student registers
        ↓
Student logs in
        ↓
Student opens Subject
        ↓
Student opens Product
        ↓
Student starts payment
        ↓
Razorpay Checkout opens
        ↓
Payment succeeds
        ↓
verify-payment executes
        ↓
Webhook is received
        ↓
Purchase is recorded
        ↓
Content unlocks
        ↓
Student closes app
        ↓
Student opens app again
        ↓
Purchase remains unlocked
```

If every step succeeds, the core production flow is ready for final release testing.

---

# 47. Important Files to Know

### Mobile

```text
mobile-app/package.json
mobile-app/app.json
mobile-app/eas.json
mobile-app/src/config/supabase.ts
mobile-app/src/config/sentry.ts
mobile-app/src/services/paymentService.ts
```

### Admin

```text
admin-panel/package.json
admin-panel/src/config/supabase.ts
admin-panel/README.md
```

### Supabase

```text
supabase/config.toml
supabase/migrations/
supabase/functions/
supabase/SECURITY_NOTICE.md
```

---

# 48. Installation Complete

Once all steps above are completed, the project should have:

```text
                    ┌──────────────────┐
                    │   MedVeda App    │
                    │ Expo / React Nat.│
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │     Supabase     │
                    │ Auth + PostgreSQL│
                    │ RLS + Functions  │
                    └───────┬──────────┘
                            │
                 ┌──────────┴──────────┐
                 ▼                     ▼
        ┌────────────────┐    ┌────────────────┐
        │  Admin Panel   │    │    Razorpay    │
        │ React + Vite   │    │    Payments    │
        └────────────────┘    └────────────────┘
```

**End of MedVeda Installation Guide**
