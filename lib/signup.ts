import type { ListmonkData, ListmonkResult } from "./listmonk";
import type { SignupRateLimitCheck } from "./signup-rate-limit";
import { isSignupBlocked, isSignupDateOfBirthAllowed, signupFormSchema } from "./signup-time-check";

export type SignupResult =
  | { status: "success"; message: string }
  | { status: "error"; message: string }
  | { status: "blocked"; message: string }
  | { status: "rate-limited"; message: string; retryAfterSeconds: number };

export type SignupDependencies = {
  now: Date;
  getClientIp: () => Promise<string>;
  checkRateLimit: SignupRateLimitCheck;
  subscribe: (data: ListmonkData) => Promise<ListmonkResult>;
};

const GENERIC_ERROR = "An error occurred while trying to sign up. Please try again.";

export async function submitSignup(data: unknown, dependencies: SignupDependencies): Promise<SignupResult> {
  const result = signupFormSchema.safeParse(data);
  if (!result.success) return { status: "error", message: "Invalid form submission." };

  const signupStatus = isSignupBlocked(dependencies.now);
  if (signupStatus.blocked) {
    return { status: "blocked", message: signupStatus.message ?? "Sign-ups are currently closed." };
  }
  if (!isSignupDateOfBirthAllowed(result.data.dob, dependencies.now)) {
    return { status: "error", message: "Invalid date of birth." };
  }

  const rateLimit = dependencies.checkRateLimit({
    clientIp: await dependencies.getClientIp(),
    email: result.data.email,
    now: dependencies.now.getTime(),
  });
  if (!rateLimit.allowed) {
    const minutes = Math.ceil(rateLimit.retryAfterSeconds / 60);
    return {
      status: "rate-limited",
      message: `Too many signup attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  try {
    const subscribed = await dependencies.subscribe({
      email: result.data.email,
      name: result.data.name,
      status: "enabled",
      lists: [3],
      attribs: { dob: result.data.dob },
    });
    return subscribed.ok
      ? {
          status: "success",
          message:
            "If your subscription still needs confirming, we’ve sent you a confirmation email. Check your inbox, junk, or spam folder if you don’t see it.",
        }
      : { status: "error", message: GENERIC_ERROR };
  } catch {
    return { status: "error", message: GENERIC_ERROR };
  }
}
