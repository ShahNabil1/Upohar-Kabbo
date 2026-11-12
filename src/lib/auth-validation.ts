import { z } from "zod";

export type AuthField = "email" | "password" | "fullName";

export const authFields = {
  email: z.string().trim().min(1, "Enter your email address.").max(254, "Email must be no longer than 254 characters.")
    .regex(/^[\x21-\x7E]+$/, "Use English characters without spaces in your email.")
    .email("Enter a valid email, such as name@company.com."),
  // Never trim or strip password characters: existing credentials must stay intact.
  password: z.string().min(6, "Password must contain at least 6 characters."),
  fullName: z.string().trim().min(1, "Enter your full name.").max(100, "Name must be no longer than 100 characters."),
};

export function validateAuthField(field: AuthField, value: string): string | undefined {
  const result = authFields[field].safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

export function validateAuthForm(values: Record<AuthField, string>, signup: boolean) {
  const errors: Partial<Record<AuthField, string>> = {};
  const fields: AuthField[] = signup ? ["fullName", "email", "password"] : ["email", "password"];
  for (const field of fields) {
    const error = validateAuthField(field, values[field]);
    if (error) errors[field] = error;
  }
  return errors;
}