import * as yup from "yup";
import { parseAuthIdentifier } from "../features/auth/identity";

export const loginSchema = yup.object({
  identifier: yup
    .string()
    .trim()
    .required("Email or mobile number is required")
    .test("email-or-phone", "Enter a valid email or mobile number with country code", (value) => {
      if (!value) return false;
      return parseAuthIdentifier(value) !== null;
    }),

  password: yup
    .string()
    .min(6, "Password must be at least 6 characters")
    .required("Password is required"),
});
