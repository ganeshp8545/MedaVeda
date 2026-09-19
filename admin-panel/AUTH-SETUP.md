# Admin Panel Login + Firestore Security Rules — Setup

## 1. Create your first admin account

Firebase Console → **Authentication** → Users tab → **Add user** →
enter your email + a password. Copy the **User UID** shown after creation.

Then: Firebase Console → **Firestore Database** → **Start collection** (if
`admins` doesn't exist yet) →
- Collection ID: `admins`
- Document ID: **paste the User UID you just copied** (exactly, not auto-ID)
- Add any one field, e.g. `email` (string) = your email — the field value
  doesn't matter, the rules only check that the document *exists*.

Repeat "Add user" + create a matching `admins/{uid}` doc for every other
person who should have admin access. To remove someone's access later,
just delete their `admins/{uid}` document (their login will stop working
immediately) — no need to delete their Auth account.

⚠️ Do **not** build a public "Sign Up" page for the admin panel — accounts
should only ever be created by you, from the Firebase Console, since this
project's Firebase Auth is shared with the mobile app.

## 2. Deploy the Firestore rules

Easiest way — paste directly:

Firebase Console → **Firestore Database** → **Rules** tab → replace
everything with the contents of `firestore.rules` (included in this zip,
at the project root) → **Publish**.

(Alternative, if you use the Firebase CLI: `firebase deploy --only
firestore:rules` from a project with `firebase.json` pointing at this
`firestore.rules` file.)

## 3. What changed in the code

- `src/context/AuthContext.tsx` — tracks Firebase Auth login state, and
  checks `admins/{uid}` in Firestore to confirm the account is actually an
  admin (not just any logged-in mobile-app user).
- `src/pages/Login.tsx` — email/password sign-in form.
- `src/components/ProtectedRoute.tsx` — redirects to `/login` if not signed
  in or not an admin.
- `src/App.tsx` — wraps all admin routes behind `ProtectedRoute`.
- `src/components/Header.tsx` — shows the real signed-in email + a working
  Logout button.

## 4. Test it

1. Open the admin panel — you should land on the Login page, not the
   Dashboard.
2. Log in with a non-admin account (or don't log in at all) — content
   should stay locked.
3. Log in with your admin account (the one you added to `admins/{uid}`) —
   you should reach the Dashboard.
4. Try opening the admin panel URL directly while logged out — it should
   redirect to `/login`, not flash any real data.
