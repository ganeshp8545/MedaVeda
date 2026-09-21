// Single source of truth for the password policy: 8-32 characters with at least one
// lowercase letter, one uppercase letter, one digit and one special character.
// Used by registration, forgot-password reset and Change Password. The website's
// reset page (website/assets/js/reset-password.js) uses the same rule.
// This is the user-friendly first layer only. The authoritative rule is enforced by Supabase Auth
// (supabase/config.toml [auth]: min 8 + lower/upper/digit/symbol; docs/security/PASSWORD_POLICY.md).
// The symbol class below is exactly the set Supabase Auth accepts, so client and server agree.
// The 32-character maximum is client-side only (Supabase has no max-length setting).
export const PASSWORD_POLICY_MESSAGE =
  "Password must be 8-32 characters and include an uppercase letter, a lowercase letter, a number, and a special character";
export const PASSWORD_POLICY_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|<>?,./`~]).{8,32}$/;
