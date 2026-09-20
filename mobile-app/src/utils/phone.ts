/**
 * Normalizes the only phone format accepted for password login: E.164.
 * A country code is mandatory so the same subscriber number in two countries
 * can never resolve to the wrong account.
 */
export function normalizePhoneNumber(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, "");
  const withPrefix = compact.startsWith("00")
    ? `+${compact.slice(2)}`
    : compact;
  // Product policy: accept common Indian local forms, but store and send
  // only E.164 to Supabase. Other countries must include their country code.
  const international = /^\d{10}$/.test(withPrefix) && /^[6-9]/.test(withPrefix)
    ? `+91${withPrefix}`
    : /^91\d{10}$/.test(withPrefix)
      ? `+${withPrefix}`
      : withPrefix;

  return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
}

export function isEmailIdentifier(value: string): boolean {
  // This is intentionally a lightweight discriminator. Yup performs the
  // complete email validation before an authentication request is made.
  return value.includes("@");
}
