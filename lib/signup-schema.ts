import { z } from "zod";

export type SignupStatus = { blocked: boolean; message?: string };

const signupFormBase = {
  name: z.string().trim().min(2, { error: "Name is required" }).max(50, { error: "Name is too long" }),
  email: z
    .string()
    .trim()
    .max(254, { error: "Email is too long" })
    .pipe(z.email({ error: "Email is invalid" }))
    .transform((email) => email.toLowerCase()),
};

export const signupFormSchema = z.object({
  ...signupFormBase,
  dob: z.iso.date(),
});

export const signupFormClientSchema = z.object({
  ...signupFormBase,
  dob: z.date({ error: "Birthday is required" }),
});
