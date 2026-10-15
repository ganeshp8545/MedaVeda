# MedVeda Privacy Policy — Draft for Legal Review

> **NOT FOR PUBLICATION.** This is a private working draft, not the live
> Privacy Policy. It contains unresolved facts and legal questions identified
> in the source audit. Do not copy it to the website or app, run it through the
> website build, or submit it to Google Play until every publication blocker
> at the end has been resolved and the final text has been reviewed by an
> Indian privacy/e-commerce lawyer.

**Platform:** MedVeda, Android package `in.medveda.app`, and
`https://www.medveda.in`  
**Operator identified by the owner:** Ashwini Fuke, individual proprietor
using the trade name MedVeda  
**Effective date:** [SET ON APPROVAL AND PUBLICATION]  
**Last updated:** [SET ON APPROVAL AND PUBLICATION]

## Publication blockers — resolve before use

- The operator's full business contact address and any address-disclosure
  requirement have not been confirmed. The owner has asked not to publish a
  private residential or street address at this stage.
- The live production location for Supabase and the locations of relevant
  service providers have not been verified.
- The production analytics purge schedule and backup retention period have
  not been verified. The claimed eight-year period for payment/accounting
  records is not legally confirmed.
- The operator has decided that MedVeda is for adults aged 18 and above only.
  The current app has no age declaration or server-enforced age restriction,
  so under-18 registration is currently possible. The operator has explicitly
  decided to keep registration and authentication unchanged. Legal review must
  assess the gap between the intended audience and actual access, including
  any applicable duties if a minor registers or uses the service. Play Console
  audience and Families answers must reflect the app's actual content and
  audience, not this intention alone.
- It is not yet confirmed whether Razorpay is currently used on the website or
  in any live non-Play distribution. The audited website source has no
  Razorpay checkout; the app source blocks Razorpay in Play production and
  internal-testing builds.
- Production configuration for account email delivery, Sentry, database
  migration state, and external deletion requests needs confirmation.
- The account-deletion function does not explicitly clear every newer
  account-linked record. The wording below must not promise that all
  associated data is deleted until the cleanup and deployed behavior have
  been reviewed.
- The support contact is confirmed for this draft, but the designated
  Grievance Officer role and any promised response times need confirmation.

## Draft policy text

### 1. Introduction

This Privacy Policy explains how MedVeda handles information when you use the
MedVeda Android app or visit `www.medveda.in`. It describes information
collected through account, learning, purchase and support features, and the
service providers involved in operating them.

Please read this policy before using the service. It should be read together
with the applicable terms and purchase/refund information. This policy is
written for human review and is not a statement that the service has been
approved by Google or certified as compliant with any law.

### 2. About MedVeda

MedVeda is a digital educational platform operated by **Ashwini Fuke**, an
individual proprietor using the brand name **MedVeda**. It provides
educational notes and learning materials for students, including students of
degree-level AYUSH courses. MedVeda does not provide doctor consultations,
medical diagnosis, prescriptions or healthcare treatment.

The operator intends the service for adults aged 18 or above and does not
permit individuals under 18 to register for or use the Android app, website,
or free or paid learning materials. The app does not check a user's age or
technically prevent under-18 access.

**Business contact location:** Dhule, Maharashtra, India.  
**Full business contact address:** [PUBLICATION BLOCKER — confirm an
appropriate business address and any applicable disclosure requirements.]

### 3. Information we collect

The information handled depends on the features you use.

**Account and sign-in information.** When you register, the app asks for your
name, email address, mobile number and password. Supabase Authentication
processes sign-in credentials and account verification/recovery. The app's
profile records also hold account and study-profile information. The audited
registration flow does not request a date of birth, identity document or age
declaration, and no age-related field or server validation was found in the
reviewed signup path. The operator has decided not to add age collection or
age-related registration controls. A user's actual age therefore cannot be
established from this registration process.

**Study profile and referrals.** We handle your selected course and academic
year, and—if you use the referral feature—referral codes, referral
relationships, and related eligibility or credit records.

**Purchases and learning activity.** We keep information needed to create and
verify orders, record purchased material and provide access. This includes
product and order identifiers, amount, payment provider, transaction status
and relevant dates. When you use learning features, the app records quiz
scores and may record app events such as screens opened, notes or videos
viewed, quiz activity and search terms. Search terms may themselves reveal
information about a topic you are studying.

**Notifications and device/app details.** If you grant notification
permission, the app can register an Expo push token and platform for delivery
to your device. The app also sends app version, build and platform information
with certain usage events. If Sentry is enabled in a release build, error
reports may include technical details such as app version, operating system
and device model.

**Support and website activity.** If you contact support, we receive the
information and message you choose to send. The website loads some resources
from Google Fonts and jsDelivr and uses Supabase on account verification and
password-reset pages. Those providers may receive technical connection
information such as your IP address and browser details when your browser
requests their resources. The website code reviewed contains no advertising
or analytics script. The production hosting/logging configuration still
requires confirmation.

**Other device information.** The current app does not ask you to upload
files. The permissions declared in the app configuration do not include
location, contacts, camera, microphone, photos, SMS or call-log access.
Confirm these points against the final Android build and its included SDKs.

### 4. How we use information

We use information to:

- create, authenticate and maintain accounts;
- show learning materials selected for your course and year;
- save and sync quiz results and other learning activity;
- take, verify, reconcile or refund purchases and make purchased content
  available;
- operate referrals and prevent payment or referral abuse;
- send account messages and notifications you have permitted;
- respond to support requests; and
- diagnose technical problems and operate the service.

The final purposes and applicable legal grounds must be checked against
MedVeda's actual business and legal advice before publication.

### 5. Authentication and account security

The app uses Supabase Authentication for account creation and email/password
sign-in, and also supports mobile-number sign-in through a backend function.
The app includes email verification, password recovery and email one-time
password flows. The sign-in session is stored using the app's secure-storage
adapter on the device.

Supabase processes authentication information to provide these features.
Production authentication settings and the provider used to send verification
and recovery emails must be confirmed before this provider description is
finalized.

### 6. Payments and purchases

MedVeda sells digital educational notes and learning materials. A payment
provider processes the payment method details entered into its checkout.
MedVeda's audited app/backend source handles transaction references, product
and order details, amounts and payment status; it does not show MedVeda
receiving or storing full card numbers, UPI PINs or bank login credentials.
Confirm this statement against any live website checkout before publication.

### 7. Google Play Billing

For digital purchases in the Play-distributed Android app, Google Play Billing
processes the payment. The app sends the purchase token, product identifier
and MedVeda order reference to MedVeda's backend for server-side verification.
The backend records purchase/order information, including the product or SKU,
amount, status and relevant transaction identifiers and dates, and uses the
verification result to grant or withhold access to the purchased material.
Purchase status may also be checked for recovery, consumption and refund or
void handling.

The app sends Google Play obfuscated account/order identifiers for purchase
association. The Play purchase token is handled by the backend and Google
Play verification service. Payment credentials entered into Google Play
checkout are processed by Google; the audited MedVeda app/backend source does
not show card numbers or UPI PINs being stored by MedVeda.

The owner reports that the developer account is not currently eligible for
alternative billing. The audited Play release configuration uses Google Play
Billing and prevents Razorpay checkout in Play production/internal-testing
builds. This draft does not claim that User Choice Billing or another
alternative billing program is approved, available or enabled.

### 8. Razorpay payments

The repository contains Razorpay checkout and server verification code for
non-Play app builds. The production and internal-testing Play profiles are
configured not to use that checkout. The website source reviewed does not
contain a Razorpay checkout. Whether a separate live website or other
non-Play checkout exists has not been confirmed.

If Razorpay is used for a purchase, MedVeda's code handles provider order and
payment IDs, internal order references, amount and status for verification,
access, refunds and support. Razorpay processes the payment method details in
its checkout. The actual live Razorpay sales channel, data fields and
provider-to-MedVeda exchange must be confirmed before this section is used.
Razorpay is not described here as an alternative payment method in the
Play-distributed Android app.

### 9. Cookies and analytics

The website source reviewed contains no advertising or tracking cookies and
no website analytics script. It loads fonts from Google Fonts and the
Supabase JavaScript library from jsDelivr. The verification and password
reset pages read tokens from a URL fragment, remove the fragment from the
address bar and create a Supabase client without persistent browser-session
storage.

The mobile app has its own event logging to MedVeda's Supabase database. Events
include app opens, screens, chapters, notes, videos, quizzes, orders,
unlocks and search terms. This is separate from website analytics. The app
also has optional crash/error reporting through Sentry when the release
configuration supplies a Sentry DSN; the production DSN and final payload
need confirmation.

### 10. Third-party service providers

The source audit identified these services or integrations:

- **Supabase:** authentication, database, storage and backend functions.
- **Google Play / Google:** app distribution, Play Billing and server purchase
  verification.
- **Expo:** push notification token registration and delivery when a user
  grants notification permission.
- **Sentry:** crash/error reporting only when configured in a release build.
- **Resend:** identified in repository configuration/comments as the
  authentication email provider; the live Supabase SMTP setting is unverified.
- **Razorpay:** non-Play checkout code is present; its actual live purchase
  channel is unverified.
- **Google Fonts and jsDelivr:** website resources requested by the browser.
- **Website hosting provider:** deployment configuration is present in the
  repository, but current production hosting and log-retention settings need
  confirmation.

The providers may process information under their own terms. MedVeda's current
contracts, provider settings, processing locations and deletion procedures
must be checked before this list is finalized.

### 11. Data sharing

Information is sent to the providers described above when needed to provide
their feature—for example, to authenticate an account, deliver a permitted
notification, verify a Play purchase or load a website resource. MedVeda may
also disclose information where required by applicable law or a valid legal
process.

The source audit found no advertising SDK or ad-targeting integration. The
operator must confirm whether any information is shared for purposes beyond
the listed service functions before making a broader statement about sale or
sharing.

### 12. Data storage and security

Connections between the app, website and services use HTTPS. The app uses
secure device storage for its sign-in session, per-user database access rules
and time-limited signed links for certain learning materials. The app also
stores some downloads, quiz data and learning state locally, including in an
offline database.

These measures reduce risk but cannot guarantee that information will always
be secure. The production database region, provider security configuration,
backup settings and final release build still need verification.

### 13. Data retention

Account and learning information is used while needed to provide the service.
When an account deletion is completed, the current system removes the account
profile, learning results, push token, purchase access, referrals,
payment-session records, analytics events and sign-in account. It keeps
order and payment records with the direct account link removed.

**Publication blocker:** The account-deletion process has not yet been
confirmed to remove every account-linked record. Some newer reservation
records are not explicitly cleared, and order/payment records retain provider
identifiers. The retention period for these records has not been confirmed.
The production analytics purge and backup retention settings also need
verification. Replace this paragraph with accurate retention periods and any
necessary exceptions after reviewing the live system and applicable
accounting/legal requirements.

### 14. Account deletion

You can start account deletion in the app under **Settings → Delete Account**.
If you cannot sign in, you can use the instructions on
[our Account & Data Deletion page](https://www.medveda.in/delete-account) to
request deletion by email without reinstalling the app.

We verify account ownership before processing an in-app request. Deleting an
account removes access to purchased materials. Some transaction records may
need to be retained for accounting, refunds or other legal requirements; the
records retained and the retention period must be stated here once confirmed.
The external request process and the full scope of deletion are being
reviewed. Do not publish this section until the deletion gap and retention
details are resolved.

### 15. Your privacy rights

If you have a question or want to make a privacy request, contact us using the
details in section 19. Depending on the laws that apply, you may be able to
request access to, correction of or deletion of your information, or exercise
other rights. We will respond as required by applicable law. Confirm the
specific rights, exceptions and grievance process with Indian legal counsel
before publication.

### 16. Adults-only eligibility

The operator intends MedVeda for adults aged 18 or above. Individuals under
18 are not permitted to register for or use the service, including the Android
app, website, and free or paid learning materials. MedVeda does not
intentionally solicit personal information from minors.

The app does not ask for age, verify a user's age, or technically prevent an
under-18 person from registering or continuing to use an account. This means
personal information from a minor could be collected through ordinary account
and usage features even though that is not MedVeda's intended audience. The
operator has decided to keep registration and authentication unchanged.

**LEGAL/OPERATIONS BLOCKER:** Decide and document how a credible report of an
under-18 account will be reviewed and handled, including notice, account
access, purchases/refunds, deletion and any lawful retention. No automated
minor-account handling process is claimed here. Have counsel review the
adults-only eligibility wording against actual access and applicable law, and
verify Play Console target-audience and Families answers against actual app
content and audience before publication.

### 17. International data processing

Our service providers may process information in India and in other countries
where they operate. [Confirm the production Supabase region and the relevant
provider processing locations, then state whether information is transferred
outside India and where.]

### 18. Changes to this policy

If this policy changes, the updated version will be posted at
`https://www.medveda.in/privacy-policy` with a revised “Last updated” date.
Any notice for a material change will be provided through an appropriate
channel after the operator confirms the actual notice process.

### 19. Contact information

**Operator:** Ashwini Fuke  
**Brand:** MedVeda  
**Email:** [medvedaforu@gmail.com](mailto:medvedaforu@gmail.com)  
**Phone:** [+91 76206 16068](tel:+917620616068)  
**Current business location:** Dhule, Maharashtra, India  
**Full business contact address:** [PUBLICATION BLOCKER — owner has asked
not to publish a private residential or street address; obtain legal review
of disclosure requirements and an appropriate business contact address.]

**Privacy and grievance contact:** [Confirm the designated officer's role and
any response-time commitment before publication.]

### 20. Effective date and last updated date

**Effective date:** [SET WHEN APPROVED FOR PUBLICATION]  
**Last updated:** [SET WHEN APPROVED FOR PUBLICATION]

## Google Play Data Safety working map

This is a source-based worksheet, not a Data Safety declaration. Google Play
requires declarations to represent collection and sharing across all
currently distributed versions; the final AAB, SDK behavior, Console history
and provider practices have not been verified. Do not submit the form based
only on this table.

| Observed data | Source / purpose | Recipient(s) observed or possible | Collection / sharing status |
|---|---|---|---|
| Name, email, mobile number, account ID; authentication credentials | Required app registration, sign-in, recovery | Supabase; account email provider unverified | App source verified; final Play category and provider answer require Console/provider review |
| Course/year and optional referral code/relationship | Content selection, referral operation | Supabase | App/backend source verified; Console classification requires review |
| Product, order, amount, purchase status/date, transaction identifiers | Payment verification, content access, refunds/support | Supabase and Google Play in Play flow; Razorpay only if a live non-Play flow is confirmed | Data fields verified in source; Razorpay live availability and Data Safety categories require confirmation |
| Play purchase token, SKU, internal order reference and obfuscated account/order IDs | Verify and associate Play purchase | Supabase backend and Google Play | Source verified; category, sharing classification and all historical Play releases require review |
| Quiz scores, test/subject identifiers, search terms and app interactions | Learning history and app analytics | Supabase | Source verified; activity collection is automatic for relevant app actions |
| Expo push token and platform | Deliver permitted push notifications | Supabase and Expo | Conditional on user permission; final SDK/provider disclosure requires review |
| Error/crash diagnostics and device/app details | Diagnose errors | Sentry if configured | Conditional on production DSN; actual release settings and payload unverified |
| Card number, UPI PIN, bank credentials | No app/backend access or storage found in audited source | Payment checkout provider handles credentials | Source-level finding only; confirm any external website flow |
| Location, contacts, camera, microphone, photos, SMS/call logs | No access found in app source/declared permissions | None found | Verify transitive SDK behavior and final merged Android manifest |
| Local downloads, offline quiz content, recent searches and preferences | Offline use and local convenience | Local app storage; no upload found for downloaded content/quiz answers | Local storage observed; confirm final Play Console treatment |

**Required manual Data Safety checks:** choose Play Console categories and
purposes using Google's current definitions; confirm required/optional
answers; audit every SDK in each distributed Play version; confirm encryption
in transit in the final AAB and provider configuration; complete account/data
deletion questions with the live URL; confirm target audience/Families
responses; and do not claim “no data collected” or “no data shared.”

## Account-deletion cleanup proposal — not implemented

The owner approved investigation and a proposal only, not implementation.
No deletion code, migration or live data was changed.

The smallest source-level cleanup to evaluate is to update the service-only
`erase_user_data` routine and its scratch test so it removes or anonymizes
account-linked reservation records created by later migrations before the
authentication user is deleted. In particular:

- `wallet_order_reservations.user_id` has no foreign key to the profile and
  is not explicitly cleared by `erase_user_data`;
- `first_discount_reservations.user_id` has no foreign key and is not
  explicitly cleared by `erase_user_data`;
- `wallet_ledger` is designed to allow anonymizing `user_id`, `referral_id`
  and `order_id` on account deletion, but the cleanup routine does not
  explicitly null these links; and
- order/payment rows retain provider references, including Play purchase
  tokens or Razorpay identifiers where present. Whether to retain, remove or
  further anonymize those references requires a payment/refund and legal
  retention decision; the payment verification flow must not be changed
  without separate approval.

Before implementation, confirm the intended deletion treatment for those
records, add coverage to the scratch account-deletion test, review compatibility
with append-only/settlement constraints, and test only against a disposable
database. Do not run any deletion against production.

## Official Google Play references reviewed

- [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311)
- [Account deletion requirements and Data deletion area](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Data Safety definitions and declaration guidance](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Google Play Billing requirement for digital goods](https://support.google.com/googleplay/android-developer/answer/10281818)
- [Families Policy](https://support.google.com/googleplay/android-developer/answer/9893335)
- [Target audience and content settings](https://support.google.com/googleplay/android-developer/answer/9867159)

Google Play policy compliance and the application's Console answers have not
been independently verified. No declaration has been submitted.
