// Client-side password strength heuristic - purely a UX aid so a student
// gets immediate visual feedback while typing a new password (a strength
// meter). It is NOT the source of truth for whether a password is
// accepted: registerSchema.ts enforces the actual policy (8-32 chars,
// upper + lower + number + special character) independently. A password
// can still fail schema validation even if this heuristic reports a
// non-zero score for whatever has been typed so far.

export type PasswordStrengthLevel = "weak" | "fair" | "good" | "strong";

export interface PasswordStrengthChecks {
  length: boolean;
  lowercase: boolean;
  uppercase: boolean;
  number: boolean;
  special: boolean;
}

export interface PasswordStrengthResult {
  // 0 (empty/very weak) - 4 (meets every requirement).
  score: 0 | 1 | 2 | 3 | 4;
  level: PasswordStrengthLevel;
  label: string;
  checks: PasswordStrengthChecks;
}

const SPECIAL_CHAR_PATTERN = /[^A-Za-z0-9]/;

const LEVELS: { level: PasswordStrengthLevel; label: string }[] = [
  { level: "weak", label: "Weak" },
  { level: "weak", label: "Weak" },
  { level: "fair", label: "Fair" },
  { level: "good", label: "Good" },
  { level: "strong", label: "Strong" },
];

export function getPasswordStrength(password: string): PasswordStrengthResult {
  const checks: PasswordStrengthChecks = {
    length: password.length >= 8 && password.length <= 32,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: SPECIAL_CHAR_PATTERN.test(password),
  };

  const passedCount = Object.values(checks).filter(Boolean).length;

  // Maps 0-5 passed checks onto a 0-4 score. An empty field is always 0
  // regardless of how many checks a zero-length string might trivially
  // fail-to-fail, so it doesn't render as "some" strength before typing
  // starts.
  const score = (password.length === 0 ? 0 : Math.max(0, passedCount - 1)) as
    | 0
    | 1
    | 2
    | 3
    | 4;

  const { level, label } = LEVELS[score];

  return { score, level, label, checks };
}
