// Same rule as mobile-app/src/utils/phone.ts (kept in step with it) and the
// database's public.normalize_phone(): E.164 only. Indian 10-digit numbers
// starting 6-9 (and 91XXXXXXXXXX) become +91XXXXXXXXXX.
export function normalizePhoneNumber(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 32) return null;
  const compact = value.trim().replace(/[\s().-]/g, "");
  const withPrefix = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  const international = /^[6-9]\d{9}$/.test(withPrefix)
    ? `+91${withPrefix}`
    : /^91[6-9]\d{9}$/.test(withPrefix)
      ? `+${withPrefix}`
      : withPrefix;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
}
