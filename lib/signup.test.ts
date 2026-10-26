import assert from "node:assert/strict";
import test from "node:test";

import type { ListmonkData, ListmonkResult } from "./listmonk";
import { submitSignup, type SignupDependencies } from "./signup";
import { createSignupRateLimiter } from "./signup-rate-limit";
import { getActiveTicketUrl } from "./signup-time-check";

const validSignup = { name: "Test Person", email: "test@example.com", dob: "2000-02-29" };
const openNow = new Date("2026-06-01T12:00:00Z");

function createDependencies(overrides: Partial<SignupDependencies> = {}) {
  const payloads: ListmonkData[] = [];
  const tickets: Array<{ email: string; ticketUrl: string }> = [];
  const dependencies: SignupDependencies = {
    now: openNow,
    currentTime: () => openNow,
    getTicketUrl: () => null,
    sendTicketEmail: async (email, ticketUrl) => {
      tickets.push({ email, ticketUrl });
      return { ok: true };
    },
    getClientIp: async () => "203.0.113.8",
    checkRateLimit: createSignupRateLimiter(),
    subscribe: async (payload) => {
      payloads.push(payload);
      return { ok: true, ticketEligible: true };
    },
    ...overrides,
  };
  return { dependencies, payloads, tickets };
}

void test("rejects malformed input before request policy dependencies", async () => {
  let policyCalls = 0;
  const { dependencies, tickets } = createDependencies({
    getTicketUrl: () => "https://tickets.example/event",
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
  assert.deepEqual(tickets, []);
});

void test("blocked signups do not read request headers or subscribe", async () => {
  let clientIpCalls = 0;
  const { dependencies, payloads, tickets } = createDependencies({
    getTicketUrl: () => "https://tickets.example/event",
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
  assert.deepEqual(tickets, []);
});

void test("underage signups do not read request headers or subscribe", async () => {
  let clientIpCalls = 0;
  const { dependencies, payloads, tickets } = createDependencies({
    getTicketUrl: () => "https://tickets.example/event",
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
  assert.deepEqual(tickets, []);
});

void test("rate-limited signups do not subscribe", async () => {
  const { dependencies, payloads, tickets } = createDependencies({
    getTicketUrl: () => "https://tickets.example/event",
    checkRateLimit: () => ({ allowed: false, retryAfterSeconds: 600 }),
  });

  assert.deepEqual(await submitSignup(validSignup, dependencies), {
    status: "rate-limited",
    message: "Too many signup attempts. Try again in 10 minutes.",
    retryAfterSeconds: 600,
  });
  assert.equal(payloads.length, 0);
  assert.deepEqual(tickets, []);
});

void test("normalizes input and transports the exact date of birth", async () => {
  const { dependencies, payloads } = createDependencies();

  assert.deepEqual(
    await submitSignup({ ...validSignup, name: "  Test Person  ", email: "  TEST@EXAMPLE.COM  " }, dependencies),
    {
      status: "success",
      message:
        "If your subscription still needs confirming, we’ve sent you a confirmation email. Check your inbox, junk, or spam folder if you don’t see it.",
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
  const { dependencies, tickets } = createDependencies({
    subscribe: async () => result,
    getTicketUrl: () => "https://tickets.example/event",
  });

  assert.deepEqual(await submitSignup(validSignup, dependencies), {
    status: "error",
    message: "An error occurred while trying to sign up. Please try again.",
  });
  assert.deepEqual(tickets, []);
});

void test("each accepted eligible signup sends the active ticket to the normalized email", async () => {
  const { dependencies, tickets } = createDependencies({ getTicketUrl: () => "https://tickets.example/event" });
  for (let repeat = 0; repeat < 2; repeat += 1) {
    assert.equal((await submitSignup({ ...validSignup, email: " TEST@EXAMPLE.COM " }, dependencies)).status, "success");
  }
  assert.deepEqual(tickets, [
    { email: "test@example.com", ticketUrl: "https://tickets.example/event" },
    { email: "test@example.com", ticketUrl: "https://tickets.example/event" },
  ]);
});

void test("ineligible successful subscriptions never send an active ticket", async () => {
  const { dependencies, tickets } = createDependencies({
    subscribe: async () => ({ ok: true, ticketEligible: false }),
    getTicketUrl: () => "https://tickets.example/event",
  });
  assert.equal((await submitSignup(validSignup, dependencies)).status, "success");
  assert.deepEqual(tickets, []);
});

void test("eligible subscriptions without an active ticket still succeed without mail", async () => {
  const { dependencies, tickets } = createDependencies();
  assert.equal((await submitSignup(validSignup, dependencies)).status, "success");
  assert.deepEqual(tickets, []);
});

void test("ticket selection uses the post-subscription clock and suppresses mail exactly at cutoff", async () => {
  const config = {
    eventDates: ["2026-06-01"],
    cutoffTime: "23:00",
    blockDurationHours: 6,
    timeZone: "Europe/Stockholm",
    message: "Closed",
    ticketUrl: "https://tickets.example/event",
  };
  for (const sendTime of ["2026-06-01T20:59:59Z", "2026-06-01T21:00:00Z", "2026-06-02T03:00:00Z"]) {
    let clock = openNow;
    const { dependencies, tickets } = createDependencies({
      currentTime: () => clock,
      subscribe: async () => {
        clock = new Date(sendTime);
        return { ok: true, ticketEligible: true };
      },
      getTicketUrl: (now) => getActiveTicketUrl(now, config),
    });
    assert.equal((await submitSignup(validSignup, dependencies)).status, "success");
    assert.equal(tickets.length, sendTime === "2026-06-01T20:59:59Z" ? 1 : 0);
  }
});

void test("ticket failure logs one generic error and preserves the public success response", async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  const { dependencies: baseline } = createDependencies();
  const expected = await submitSignup(validSignup, baseline);
  for (const outcome of ["false", "throw"]) {
    const { dependencies } = createDependencies({
      getTicketUrl: () => "https://tickets.example/private",
      sendTicketEmail: async () => {
        if (outcome === "throw") throw new Error("test@example.com https://tickets.example/private credentials");
        return { ok: false };
      },
    });
    assert.deepEqual(await submitSignup(validSignup, dependencies), expected);
  }
  assert.deepEqual(logs, [["Ticket email could not be queued."], ["Ticket email could not be queued."]]);
});

void test("signup waits for the ticket queue result before returning", async () => {
  let finishSend!: (result: { ok: boolean }) => void;
  let started!: () => void;
  const sending = new Promise<void>((resolve) => {
    started = resolve;
  });
  const queued = new Promise<{ ok: boolean }>((resolve) => {
    finishSend = resolve;
  });
  const { dependencies } = createDependencies({
    getTicketUrl: () => "https://tickets.example/event",
    sendTicketEmail: () => {
      started();
      return queued;
    },
  });
  let returned = false;
  const signup = submitSignup(validSignup, dependencies).then((result) => {
    returned = true;
    return result;
  });
  await Promise.race([sending, signup.then(() => assert.fail("Signup returned without awaiting the ticket sender"))]);
  assert.equal(returned, false);
  finishSend({ ok: true });
  assert.equal((await signup).status, "success");
});

void test("thrown subscription failure keeps the generic error and never sends tickets", async () => {
  const { dependencies, tickets } = createDependencies({
    getTicketUrl: () => "https://tickets.example/event",
    subscribe: async () => {
      throw new Error("upstream details");
    },
  });
  assert.deepEqual(await submitSignup(validSignup, dependencies), {
    status: "error",
    message: "An error occurred while trying to sign up. Please try again.",
  });
  assert.deepEqual(tickets, []);
});
