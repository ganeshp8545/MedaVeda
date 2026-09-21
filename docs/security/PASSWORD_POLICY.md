# Password policy — what is enforced where

| Rule | Supabase Auth (server, authoritative) | Mobile app + website reset page (first layer) |
|---|---|---|
| Minimum length 8 | **Yes** — `minimum_password_length = 8` | Yes |
| Lowercase, uppercase, digit, symbol | **Yes** — `password_requirements = "lower_upper_letters_digits_symbols"` | Yes (same symbol set as Supabase) |
| Maximum length 32 | **No — Supabase has no such setting** (it only caps at bcrypt's 72 bytes) | Yes (client-only) |
| Leaked-password (HIBP) check | Dashboard toggle, **Pro plan only** | n/a |

The server settings are declared in `supabase/config.toml` `[auth]`. Supabase Auth applies them on every path
that sets a password (`signUp`, `updateUser`, recovery, the admin API), so a direct HTTP call cannot skip the
app's form. The 32-character maximum cannot be enforced server-side; a longer password is harmless (up to 72 bytes)
and is not a security gap. Passwords are never stored, logged or handled by our own code.

**Live status (read with `supabase config diff` on 2026-09-21): NOT YET APPLIED.** Live is still `minimum_password_length = 6`,
no complexity requirement. Until the owner applies it, the server accepts weak passwords sent directly to the API.

## Apply (owner)
```bash
supabase config diff            # must show ONLY minimum_password_length (6 -> 8) and password_requirements (none -> ...)
supabase config push            # confirm each prompt; only declared keys are pushed
```
or Dashboard → Authentication → Sign In / Providers → Email → Password: min length 8, "Lowercase, uppercase letters, digits and symbols";
then Authentication → Attack Protection → "Prevent use of leaked passwords" (Pro plan).

## Expected accept / reject matrix
Symbols Supabase counts: ``!@#$%^&*()_+-=[]{};':"\|<>?,./`~``

| Password | Server (after apply) | App / website | Why |
|---|---|---|---|
| `abc` | reject | reject | too short, no upper/digit/symbol |
| `abcdefgh` | reject | reject | no upper, digit, symbol |
| `abcdefgh1` | reject | reject | no upper, symbol |
| `Abcdefgh1` | reject | reject | no symbol |
| `Abcdefgh!` | reject | reject | no digit |
| `Abcdefg1!` | **accept** | **accept** | 9 chars, all four classes |
| 33+ characters, all classes | accept | reject | max length is client-only |

## Tests
`mobile-app/scripts/password-policy-selftest.mjs` (run in CI) checks the six passwords above (and more) against the
mobile pattern and the website pattern, that both patterns are identical, and that `config.toml` declares the server rule.
It **cannot** prove what the live server does — only `supabase config diff` (declared vs live) and a real sign-up
attempt after applying can. After applying, verify with a throwaway address: `POST /auth/v1/signup` with `Abcdefgh1`
must return 422 `weak_password`.
