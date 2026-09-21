
import * as yup from "yup";
import { PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_PATTERN } from "./passwordPolicy";
import { parseAuthIdentifier } from "../features/auth/identity";

// OWASP Mobile-aligned password policy: 8-32 characters, at least one
// uppercase letter, one lowercase letter, one digit, and one special
// character. Enforced here (not only in the UI strength meter) so a
// weak password can never reach registerWithEmailAndMobile / Supabase
// Auth - the strength meter is a UX aid, this schema is the actual gate.

// Referral codes are generated as 7 characters from A-Z/2-9 (no 0/O/1/I/L);
// accept 6-10 to leave room to change the length. The field is optional.
export const REFERRAL_CODE_PATTERN = /^[A-Z2-9]{6,10}$/;

export const registerSchema = yup.object({
  fullName: yup
    .string()
    .trim()
    .required("Full Name is required")
    .min(2, "Enter your full name"),

  email: yup
    .string()
    .trim()
    .required("Email is required")
    .test("email", "Enter a valid email address", (value) => !!value && parseAuthIdentifier(value)?.kind === "email"),

  mobileNumber: yup
    .string()
    .trim()
    .required("Mobile number is required")
    .test("mobile", "Enter a valid 10-digit Indian mobile number", (value) => !!value && parseAuthIdentifier(value)?.kind === "phone"),

  password: yup
    .string()
    .required("Password is required")
    .matches(PASSWORD_POLICY_PATTERN, PASSWORD_POLICY_MESSAGE),

  referralCode: yup
    .string()
    .trim()
    .optional()
    .test(
      "referral-code",
      "Enter a valid referral code, or leave this blank",
      (value) => !value || REFERRAL_CODE_PATTERN.test(value.toUpperCase())
    ),

  confirmPassword: yup
    .string()
    .required("Confirm Password is required")
    .oneOf([yup.ref("password")], "Passwords do not match"),
});
