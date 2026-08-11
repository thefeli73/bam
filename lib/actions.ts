"use server";

import { headers } from "next/headers";

import { submitSignup, type SignupResult } from "./signup";
import { checkSignupRateLimit, getForwardedClientIp } from "./signup-rate-limit";

export async function signupFormSubmit(data: unknown): Promise<SignupResult> {
  return submitSignup(data, {
    now: new Date(),
    getClientIp: async () => getForwardedClientIp((await headers()).get("x-forwarded-for")),
    checkRateLimit: checkSignupRateLimit,
    subscribe: async (payload) => {
      const { default: listmonk } = await import("./listmonk");
      return listmonk(payload);
    },
  });
}
