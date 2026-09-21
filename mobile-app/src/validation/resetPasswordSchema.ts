import * as yup from "yup";
import { PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_PATTERN } from "./passwordPolicy";

// Same OWASP-aligned policy as registerSchema.ts (8-32 chars, upper +
// lower + number + special char) - kept identical so a password that
// clears this screen is guaranteed to clear Supabase's own policy too.

export const resetPasswordSchema = yup.object({
  password: yup
    .string()
    .required("New password is required")
    .matches(PASSWORD_POLICY_PATTERN, PASSWORD_POLICY_MESSAGE),

  confirmPassword: yup
    .string()
    .required("Confirm your new password")
    .oneOf([yup.ref("password")], "Passwords do not match"),
});