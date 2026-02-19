import assert from "node:assert/strict";
import test from "node:test";

import { isSignupBlocked } from "./signup-time-check";

test("allows signups before cutoff", () => {
  const result = isSignupBlocked(new Date("2025-10-25T22:00:00"));
  assert.equal(result.blocked, false);
  assert.equal(result.message, undefined);
});

test("blocks signups exactly at cutoff and returns message", () => {
  const result = isSignupBlocked(new Date("2025-10-25T23:00:00"));
  assert.equal(result.blocked, true);
  assert.equal(result.message, "Sign-ups are closed for today's event.");
});

test("blocks signups during block window", () => {
  const result = isSignupBlocked(new Date("2025-10-26T02:00:00"));
  assert.equal(result.blocked, true);
});

test("blocks signups shortly after cutoff on event night", () => {
  const result = isSignupBlocked(new Date("2025-10-25T23:30:00"));
  assert.equal(result.blocked, true);
});

test("blocks signups right before block window ends", () => {
  const result = isSignupBlocked(new Date("2025-10-26T04:59:59"));
  assert.equal(result.blocked, true);
});

test("allows signups when block window ends", () => {
  const result = isSignupBlocked(new Date("2025-10-26T05:00:00"));
  assert.equal(result.blocked, false);
});

test("does not block non-event dates", () => {
  const result = isSignupBlocked(new Date("2025-10-20T23:00:00"));
  assert.equal(result.blocked, false);
});

test("allows signups well after block window ends", () => {
  const result = isSignupBlocked(new Date("2025-10-26T12:00:00"));
  assert.equal(result.blocked, false);
});
