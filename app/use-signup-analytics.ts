"use client";

import { usePlausible } from "next-plausible";
import { type FormEvent, useCallback, useEffect, useRef } from "react";

import type { SignupResult } from "@/lib/signup";

type SignupEvents = {
  "Signup Started": never;
  "Signup Validation Failed": { invalid_fields: string };
  "Signup Submitted": never;
  "Signup Succeeded": never;
  "Signup Failed": { reason: "server_error" | "rate_limited" | "signup_closed" };
  "Signup Closed Viewed": never;
};

const signupFields = ["email", "name", "dob"] as const;
type SignupField = (typeof signupFields)[number];

const failureReasons = {
  error: "server_error",
  "rate-limited": "rate_limited",
  blocked: "signup_closed",
} as const;

export function useSignupAnalytics(initiallyBlocked: boolean) {
  const plausible = usePlausible<SignupEvents>();
  const startedTrackedRef = useRef(false);
  const closedViewedTrackedRef = useRef(false);
  const invalidFieldsRef = useRef(new Set<SignupField>());
  const validationEventQueuedRef = useRef(false);

  const queueValidationFailed = useCallback(
    (fields: readonly SignupField[]) => {
      fields.forEach((field) => invalidFieldsRef.current.add(field));
      if (validationEventQueuedRef.current) return;

      validationEventQueuedRef.current = true;
      queueMicrotask(() => {
        const invalidFields = signupFields.filter((field) => invalidFieldsRef.current.has(field)).join(",");
        invalidFieldsRef.current.clear();
        validationEventQueuedRef.current = false;
        if (invalidFields) plausible("Signup Validation Failed", { props: { invalid_fields: invalidFields } });
      });
    },
    [plausible],
  );

  const trackStarted = useCallback(() => {
    if (startedTrackedRef.current) return;
    startedTrackedRef.current = true;
    plausible("Signup Started");
  }, [plausible]);

  const trackNativeInvalid = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      const field = (event.target as HTMLInputElement).name;
      if (signupFields.includes(field as SignupField)) queueValidationFailed([field as SignupField]);
    },
    [queueValidationFailed],
  );

  const trackValidationFailed = useCallback(
    (errors: Partial<Record<SignupField, unknown>>) => {
      queueValidationFailed(signupFields.filter((field) => errors[field]));
    },
    [queueValidationFailed],
  );

  const trackSubmitted = useCallback(() => plausible("Signup Submitted"), [plausible]);

  const trackResult = useCallback(
    (result: SignupResult) => {
      if (result.status === "success") {
        plausible("Signup Succeeded");
      } else {
        plausible("Signup Failed", { props: { reason: failureReasons[result.status] } });
      }
    },
    [plausible],
  );

  const trackServerError = useCallback(
    () => plausible("Signup Failed", { props: { reason: "server_error" } }),
    [plausible],
  );

  useEffect(() => {
    if (!initiallyBlocked || closedViewedTrackedRef.current) return;
    closedViewedTrackedRef.current = true;
    plausible("Signup Closed Viewed");
  }, [initiallyBlocked, plausible]);

  return {
    trackStarted,
    trackNativeInvalid,
    trackValidationFailed,
    trackSubmitted,
    trackResult,
    trackServerError,
  };
}
