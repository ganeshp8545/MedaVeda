import * as yup from "yup";
import { parseAuthIdentifier } from "../features/auth/identity";

export const forgotPasswordSchema = yup.object({
  identifier: yup
    .string()
    .trim()
    .required("Email or mobile number is required")
    .test("identifier", "Enter a valid email or mobile number", (value) => !!value && parseAuthIdentifier(value) !== null),
});
