"use server";

import { isSignupBlocked, isSignupDateOfBirthAllowed, signupFormSchema } from "./signup-time-check";
import type { listmonkData } from "./listmonk";

export async function signupFormSubmit(data: unknown): Promise<string> {
  const result = signupFormSchema.safeParse(data);
  if (!result.success) {
    return "Invalid form submission";
  }
  const signup = result.data;
  const now = new Date();
  const signupStatus = isSignupBlocked(now);
  if (signupStatus.blocked) {
    return signupStatus.message ?? "Sign-ups are currently closed.";
  }
  if (!isSignupDateOfBirthAllowed(signup.dob, now)) {
    return "Invalid date of birth";
  }

  const listmonkData: listmonkData = {
    email: signup.email,
    name: signup.name,
    status: "enabled",
    lists: [3],
    attribs: {
      dob: signup.dob,
    },
  };
  const { default: listmonk } = await import("./listmonk");
  return await listmonk(listmonkData);
}
