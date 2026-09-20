import { isEmailIdentifier, normalizePhoneNumber } from "../../utils/phone";

// Pragmatic RFC 5322 mailbox validation. The server remains authoritative.
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export type AuthIdentifier =
  | { kind: "email"; value: string }
  | { kind: "phone"; value: string };

export function parseAuthIdentifier(input: string): AuthIdentifier | null {
  const value = input.trim();
  if (isEmailIdentifier(value)) {
    const email = value.toLowerCase();
    return EMAIL_PATTERN.test(email) ? { kind: "email", value: email } : null;
  }
  const phone = normalizePhoneNumber(value);
  return phone ? { kind: "phone", value: phone } : null;
}
