import * as yup from "yup";

// Same OWASP-aligned policy as registerSchema.ts (8-32 chars, upper +
// lower + number + special char) - kept identical so a password that
// clears this screen is guaranteed to clear Supabase's own policy too.
const PASSWORD_POLICY_MESSAGE =
  "Password must be 8-32 characters and include an uppercase letter, a lowercase letter, a number, and a special character";
const PASSWORD_POLICY_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,32}$/;

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