
import * as yup from "yup";

export const registerSchema = yup.object({
  fullName: yup
    .string()
    .required("Full Name is required"),

  email: yup
    .string()
    .email("Enter valid email")
    .required("Email is required"),

  password: yup
    .string()
    .min(6, "Password must be at least 6 characters")
    .required("Password is required"),

  confirmPassword: yup
    .string()
    .oneOf([yup.ref("password")], "Passwords do not match")
    .required("Confirm Password is required"),
});