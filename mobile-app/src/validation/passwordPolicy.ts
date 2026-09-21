// Single source of truth for the password policy: 8-32 characters with at least one
// lowercase letter, one uppercase letter, one digit and one special character.
// Used by registration, forgot-password reset and Change Password. The website's
// reset page (website/assets/js/reset-password.js) uses the same rule.
// This is a client-side gate: the matching server-side rule must also be set in the
// Supabase dashboard (Authentication -> Sign In / Providers -> Password requirements).
export const PASSWORD_POLICY_MESSAGE =
  "Password must be 8-32 characters and include an uppercase letter, a lowercase letter, a number, and a special character";
export const PASSWORD_POLICY_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,32}$/;
