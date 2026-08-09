"use server";

import { getSignupDateBounds, isSignupBlocked, signupFormSchema } from "./signup-time-check";
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
  const { oldestDate, youngestDate } = getSignupDateBounds(now);
  if (signup.dob > youngestDate || signup.dob < oldestDate) {
    return "Invalid date of birth";
  }
  const offset = signup.dob.getTimezoneOffset();
  const dob = new Date(signup.dob.getTime() - offset * 60 * 1000);

  const listmonkData: listmonkData = {
    email: signup.email,
    name: signup.name,
    status: "enabled",
    lists: [3],
    attribs: {
      dob: dob.toISOString().split("T")[0],
    },
  };
  const { default: listmonk } = await import("./listmonk");
  return await listmonk(listmonkData);
}
