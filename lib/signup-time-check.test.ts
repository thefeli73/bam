import assert from "node:assert/strict";
import test from "node:test";

import {
  getSignupDateBounds,
  isInstantWithinEventBlock,
  isSignupBlocked,
  isSignupDateOfBirthAllowed,
  signupFormSchema,
} from "./signup-time-check";

void test("computes signup date bounds from the Stockholm calendar date", () => {
  assert.deepEqual(getSignupDateBounds(new Date("2026-05-09T22:30:00Z")), {
    oldestDate: "1926-05-10",
    youngestDate: "2006-05-10",
  });
});

void test("preserves setFullYear rollover for leap-day bounds", () => {
  assert.deepEqual(getSignupDateBounds(new Date("2000-02-29T12:00:00Z")), {
    oldestDate: "1900-03-01",
    youngestDate: "1980-02-29",
  });
});

void test("uses CEST for the configured May 2026 event block", () => {
  assert.equal(isSignupBlocked(new Date("2026-05-09T20:59:59Z")).blocked, false);
  assert.equal(isSignupBlocked(new Date("2026-05-09T21:00:00Z")).blocked, true);
  assert.equal(isSignupBlocked(new Date("2026-05-10T02:59:59Z")).blocked, true);
  assert.equal(isSignupBlocked(new Date("2026-05-10T03:00:00Z")).blocked, false);
});

void test("returns the configured message while signups are blocked", () => {
  assert.deepEqual(isSignupBlocked(new Date("2026-05-09T21:00:00Z")), {
    blocked: true,
    message: "Sign-ups are closed for today's event.",
  });
});

void test("uses CET for the configured winter event block", () => {
  assert.equal(isSignupBlocked(new Date("1999-01-01T21:59:59Z")).blocked, false);
  assert.equal(isSignupBlocked(new Date("1999-01-01T22:00:00Z")).blocked, true);
  assert.equal(isSignupBlocked(new Date("1999-01-02T03:59:59Z")).blocked, true);
  assert.equal(isSignupBlocked(new Date("1999-01-02T04:00:00Z")).blocked, false);
});

void test("keeps a continuous civil window across spring DST", () => {
  const isBlocked = (instant: string) =>
    isInstantWithinEventBlock(new Date(instant), "2026-03-28", "23:00", 6, "Europe/Stockholm");

  assert.equal(isBlocked("2026-03-28T21:59:59Z"), false);
  assert.equal(isBlocked("2026-03-28T22:00:00Z"), true);
  assert.equal(isBlocked("2026-03-29T00:59:59Z"), true);
  assert.equal(isBlocked("2026-03-29T01:00:00Z"), true);
  assert.equal(isBlocked("2026-03-29T02:59:59Z"), true);
  assert.equal(isBlocked("2026-03-29T03:00:00Z"), false);
});

void test("keeps a continuous window that includes the repeated autumn hour", () => {
  const isBlocked = (instant: string) =>
    isInstantWithinEventBlock(new Date(instant), "2026-10-24", "23:00", 6, "Europe/Stockholm");

  assert.equal(isBlocked("2026-10-24T20:59:59Z"), false);
  assert.equal(isBlocked("2026-10-24T21:00:00Z"), true);
  assert.equal(isBlocked("2026-10-25T00:59:59Z"), true);
  assert.equal(isBlocked("2026-10-25T01:00:00Z"), true);
  assert.equal(isBlocked("2026-10-25T01:59:59Z"), true);
  assert.equal(isBlocked("2026-10-25T03:59:59Z"), true);
  assert.equal(isBlocked("2026-10-25T04:00:00Z"), false);
});

void test("validates event block policy inputs", () => {
  assert.throws(() => isInstantWithinEventBlock(new Date(Number.NaN), "2026-05-09", "23:00", 6, "Europe/Stockholm"));
  assert.throws(() => isInstantWithinEventBlock(new Date(), "2026-02-30", "23:00", 6, "Europe/Stockholm"));
  assert.throws(() => isInstantWithinEventBlock(new Date(), "2026-05-09", "24:00", 6, "Europe/Stockholm"));
  assert.throws(() => isInstantWithinEventBlock(new Date(), "2026-05-09", "23:00", 0, "Europe/Stockholm"));
});

void test("accepts inclusive age bounds and rejects dates outside them", () => {
  const now = new Date("2026-05-09T22:30:00Z");

  assert.equal(isSignupDateOfBirthAllowed("2006-05-10", now), true);
  assert.equal(isSignupDateOfBirthAllowed("1926-05-10", now), true);
  assert.equal(isSignupDateOfBirthAllowed("2006-05-11", now), false);
  assert.equal(isSignupDateOfBirthAllowed("1926-05-09", now), false);
  assert.equal(isSignupDateOfBirthAllowed("2027-01-01", now), false);
  assert.equal(isSignupDateOfBirthAllowed("2000-02-30", now), false);
});

void test("server signup schema accepts only valid ISO date strings", () => {
  const signup = { name: "Test Person", email: "test@example.com" };

  assert.equal(signupFormSchema.safeParse({ ...signup, dob: "2000-02-29" }).success, true);
  assert.equal(signupFormSchema.safeParse({ ...signup, dob: "2000-02-30" }).success, false);
  assert.equal(signupFormSchema.safeParse({ ...signup, dob: new Date("2000-02-29T00:00:00Z") }).success, false);
});
