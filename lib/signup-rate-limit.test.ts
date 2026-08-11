import assert from "node:assert/strict";
import test from "node:test";

import { createSignupRateLimiter, getForwardedClientIp } from "./signup-rate-limit";

void test("uses the trusted first forwarded address with a stable fallback", () => {
  assert.equal(getForwardedClientIp("203.0.113.8, 10.0.0.4"), "203.0.113.8");
  assert.equal(getForwardedClientIp(" 203.0.113.8 "), "203.0.113.8");
  assert.equal(getForwardedClientIp(" , 10.0.0.4"), "unknown");
  assert.equal(getForwardedClientIp(null), "unknown");
});

void test("allows 20 IP attempts and blocks the next for the remaining window", () => {
  const check = createSignupRateLimiter();
  for (let index = 0; index < 20; index += 1) {
    assert.deepEqual(check({ clientIp: "203.0.113.8", email: `person-${index}@example.com`, now: 0 }), {
      allowed: true,
    });
  }

  assert.deepEqual(check({ clientIp: "203.0.113.8", email: "next@example.com", now: 1 }), {
    allowed: false,
    retryAfterSeconds: 600,
  });
});

void test("allows 3 email attempts and blocks the next across IP addresses", () => {
  const check = createSignupRateLimiter();
  for (let index = 0; index < 3; index += 1) {
    assert.deepEqual(check({ clientIp: `203.0.113.${index}`, email: "person@example.com", now: 0 }), {
      allowed: true,
    });
  }

  assert.deepEqual(check({ clientIp: "203.0.113.9", email: "person@example.com", now: 0 }), {
    allowed: false,
    retryAfterSeconds: 3600,
  });
});

void test("resets windows at exact expiry and isolates keys", () => {
  const check = createSignupRateLimiter();
  for (let index = 0; index < 3; index += 1) {
    assert.equal(check({ clientIp: `198.51.100.${index}`, email: "first@example.com", now: 0 }).allowed, true);
  }

  assert.equal(check({ clientIp: "198.51.100.9", email: "second@example.com", now: 1 }).allowed, true);
  assert.deepEqual(check({ clientIp: "198.51.100.10", email: "first@example.com", now: 3_600_000 }), {
    allowed: true,
  });
});

void test("returns the longest active retry interval", () => {
  const check = createSignupRateLimiter();
  for (let index = 0; index < 20; index += 1) {
    check({ clientIp: "192.0.2.1", email: `ip-${index}@example.com`, now: 0 });
  }
  for (let index = 0; index < 3; index += 1) {
    check({ clientIp: `192.0.2.${index + 2}`, email: "target@example.com", now: 300_000 });
  }

  assert.deepEqual(check({ clientIp: "192.0.2.1", email: "target@example.com", now: 360_000 }), {
    allowed: false,
    retryAfterSeconds: 3540,
  });
});
