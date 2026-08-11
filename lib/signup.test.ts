import assert from "node:assert/strict";
import test from "node:test";

import type { ListmonkData, ListmonkResult } from "./listmonk";
import { submitSignup, type SignupDependencies } from "./signup";
import { createSignupRateLimiter } from "./signup-rate-limit";

const validSignup = { name: "Test Person", email: "test@example.com", dob: "2000-02-29" };
const openNow = new Date("2026-06-01T12:00:00Z");

function createDependencies(overrides: Partial<SignupDependencies> = {}) {
  const payloads: ListmonkData[] = [];
  const dependencies: SignupDependencies = {
    now: openNow,
    getClientIp: async () => "203.0.113.8",
    checkRateLimit: createSignupRateLimiter(),
    subscribe: async (payload) => {
      payloads.push(payload);
      return { ok: true };
    },
    ...overrides,
  };
  return { dependencies, payloads };
}

void test("rejects malformed input before request policy dependencies", async () => {
  let policyCalls = 0;
  const { dependencies } = createDependencies({
    getClientIp: async () => {
      policyCalls += 1;
      return "203.0.113.8";
    },
  });

  assert.deepEqual(await submitSignup({}, dependencies), {
    status: "error",
    message: "Invalid form submission.",
  });
  assert.equal(policyCalls, 0);
});

void test("blocked signups do not read request headers or subscribe", async () => {
  let clientIpCalls = 0;
  const { dependencies, payloads } = createDependencies({
    now: new Date("2026-05-09T21:00:00Z"),
    getClientIp: async () => {
      clientIpCalls += 1;
      return "203.0.113.8";
    },
  });

  assert.deepEqual(await submitSignup(validSignup, dependencies), {
    status: "blocked",
    message: "Sign-ups are closed for today's event.",
  });
  assert.equal(clientIpCalls, 0);
  assert.equal(payloads.length, 0);
});

void test("underage signups do not read request headers or subscribe", async () => {
  let clientIpCalls = 0;
  const { dependencies, payloads } = createDependencies({
    getClientIp: async () => {
      clientIpCalls += 1;
      return "203.0.113.8";
    },
  });

  assert.deepEqual(await submitSignup({ ...validSignup, dob: "2010-01-01" }, dependencies), {
    status: "error",
    message: "Invalid date of birth.",
  });
  assert.equal(clientIpCalls, 0);
  assert.equal(payloads.length, 0);
});

void test("rate-limited signups do not subscribe", async () => {
  const { dependencies, payloads } = createDependencies({
    checkRateLimit: () => ({ allowed: false, retryAfterSeconds: 600 }),
  });

  assert.deepEqual(await submitSignup(validSignup, dependencies), {
    status: "rate-limited",
    message: "Too many signup attempts. Try again in 10 minutes.",
    retryAfterSeconds: 600,
  });
  assert.equal(payloads.length, 0);
});

void test("normalizes input and transports the exact date of birth", async () => {
  const { dependencies, payloads } = createDependencies();

  assert.deepEqual(
    await submitSignup({ ...validSignup, name: "  Test Person  ", email: "  TEST@EXAMPLE.COM  " }, dependencies),
    {
      status: "success",
      message: "Thanks for signing up! Please check your email for a confirmation.",
    },
  );
  assert.deepEqual(payloads, [
    {
      name: "Test Person",
      email: "test@example.com",
      status: "enabled",
      lists: [3],
      attribs: { dob: validSignup.dob },
    },
  ]);
});

void test("returns a generic error when Listmonk fails", async () => {
  const result: ListmonkResult = { ok: false };
  const { dependencies } = createDependencies({ subscribe: async () => result });

  assert.deepEqual(await submitSignup(validSignup, dependencies), {
    status: "error",
    message: "An error occurred while trying to sign up. Please try again.",
  });
});
