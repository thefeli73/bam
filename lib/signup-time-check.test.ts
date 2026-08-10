import assert from "node:assert/strict";
import test from "node:test";

import { getSignupDateBounds, isSignupBlocked } from "./signup-time-check";

void test("computes signup date bounds 20 and 100 years before current time", () => {
  const bounds = getSignupDateBounds(new Date(2026, 0, 15, 12));

  assert.deepEqual(bounds, {
    youngestDate: new Date(2006, 0, 15, 12),
    oldestDate: new Date(1926, 0, 15, 12),
  });
});

void test("allows signups before cutoff", () => {
  const result = isSignupBlocked(new Date("2026-05-09T22:00:00"));
  assert.equal(result.blocked, false);
  assert.equal(result.message, undefined);
});

void test("blocks signups exactly at cutoff and returns message", () => {
  const result = isSignupBlocked(new Date("2026-05-09T23:00:00"));
  assert.equal(result.blocked, true);
  assert.equal(result.message, "Sign-ups are closed for today's event.");
});

void test("blocks signups during block window", () => {
  const result = isSignupBlocked(new Date("2026-05-10T02:00:00"));
  assert.equal(result.blocked, true);
});

void test("blocks signups shortly after cutoff on event night", () => {
  const result = isSignupBlocked(new Date("2026-05-09T23:30:00"));
  assert.equal(result.blocked, true);
});

void test("blocks signups right before block window ends", () => {
  const result = isSignupBlocked(new Date("2026-05-10T04:59:59"));
  assert.equal(result.blocked, true);
});

void test("allows signups when block window ends", () => {
  const result = isSignupBlocked(new Date("2026-05-10T05:00:00"));
  assert.equal(result.blocked, false);
});

void test("does not block non-event dates", () => {
  const result = isSignupBlocked(new Date("2026-05-04T23:00:00"));
  assert.equal(result.blocked, false);
});

void test("allows signups well after block window ends", () => {
  const result = isSignupBlocked(new Date("2026-05-10T12:00:00"));
  assert.equal(result.blocked, false);
});
