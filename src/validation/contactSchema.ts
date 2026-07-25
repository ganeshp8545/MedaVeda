import * as yup from "yup";

export const contactSchema = yup.object({
  name: yup
    .string()
    .trim()
    .min(2, "Name is too short")
    .required("Name is required"),
  email: yup
    .string()
    .trim()
    .email("Enter a valid email")
    .required("Email is required"),
  message: yup
    .string()
    .trim()
    .min(10, "Message should be at least 10 characters")
    .required("Message is required"),
});

export type ContactFormValues = yup.InferType<typeof contactSchema>;
