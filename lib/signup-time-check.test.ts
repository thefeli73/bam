import assert from "node:assert/strict";
import test from "node:test";

import {
  getActiveTicketUrl,
  getSignupDateBounds,
  isInstantWithinEventBlock,
  isSignupBlocked,
  isSignupDateOfBirthAllowed,
  signupFormSchema,
} from "./signup-time-check";

const ticketConfig = {
  eventDates: ["2026-08-29", "2026-05-09", "1999-01-01"],
  cutoffTime: "23:00",
  blockDurationHours: 6,
  timeZone: "Europe/Stockholm",
  message: "Closed",
  ticketUrl: "https://tickets.example.com/event",
};

void test("uses the latest chronological event regardless of array order", () => {
  for (const eventDates of [
    ["2026-08-29", "2026-05-09", "1999-01-01"],
    ["1999-01-01", "2026-08-29", "2026-05-09"],
    ["1999-01-01", "2026-05-09", "2026-08-29"],
  ]) {
    assert.equal(
      getActiveTicketUrl(new Date("2026-05-10T04:00:00Z"), { ...ticketConfig, eventDates }),
      ticketConfig.ticketUrl,
    );
  }
});

void test("stops tickets exactly at the latest event's local cutoff", () => {
  assert.equal(getActiveTicketUrl(new Date("2026-08-29T20:59:59.999Z"), ticketConfig), ticketConfig.ticketUrl);
  assert.equal(getActiveTicketUrl(new Date("2026-08-29T21:00:00Z"), ticketConfig), null);
});

void test("does not reactivate tickets after the signup closure ends", () => {
  assert.equal(getActiveTicketUrl(new Date("2026-08-30T03:00:00Z"), ticketConfig), null);
  assert.equal(getActiveTicketUrl(new Date("2027-01-01T00:00:00Z"), ticketConfig), null);
});

void test("uses winter timezone offset for the ticket cutoff", () => {
  const config = { ...ticketConfig, eventDates: ["2026-01-10"] };
  assert.equal(getActiveTicketUrl(new Date("2026-01-10T21:59:59Z"), config), config.ticketUrl);
  assert.equal(getActiveTicketUrl(new Date("2026-01-10T22:00:00Z"), config), null);
});

void test("expires tickets at the first autumn cutoff without reactivating after rollback", () => {
  const config = { ...ticketConfig, eventDates: ["2026-10-25"], cutoffTime: "02:30" };
  assert.equal(getActiveTicketUrl(new Date("2026-10-25T00:29:59.999Z"), config), config.ticketUrl);
  assert.equal(getActiveTicketUrl(new Date("2026-10-25T00:30:00Z"), config), null);
  assert.equal(getActiveTicketUrl(new Date("2026-10-25T01:00:00Z"), config), null);
  assert.equal(getActiveTicketUrl(new Date("2026-10-25T01:29:59.999Z"), config), null);
  assert.equal(getActiveTicketUrl(new Date("2026-10-25T01:30:00Z"), config), null);
  // Results depend on the instant, not on whether an expired request ran first.
  assert.equal(getActiveTicketUrl(new Date("2026-10-25T00:29:59.999Z"), config), config.ticketUrl);
});

void test("keeps tickets expired across Lord Howe's half-hour autumn rollback", () => {
  const config = {
    ...ticketConfig,
    eventDates: ["2026-04-05"],
    cutoffTime: "01:45",
    timeZone: "Australia/Lord_Howe",
  };
  assert.equal(getActiveTicketUrl(new Date("2026-04-04T14:44:59.999Z"), config), config.ticketUrl);
  assert.equal(getActiveTicketUrl(new Date("2026-04-04T14:45:00Z"), config), null);
  assert.equal(getActiveTicketUrl(new Date("2026-04-04T15:00:00Z"), config), null);
  assert.equal(getActiveTicketUrl(new Date("2026-04-04T15:15:00Z"), config), null);
});

void test("expires a skipped spring cutoff at the forward transition, not after the gap", () => {
  const config = { ...ticketConfig, eventDates: ["2026-03-29"], cutoffTime: "02:30" };
  assert.equal(getActiveTicketUrl(new Date("2026-03-29T00:59:59.999Z"), config), config.ticketUrl);
  assert.equal(getActiveTicketUrl(new Date("2026-03-29T01:00:00Z"), config), null);
  assert.equal(getActiveTicketUrl(new Date("2026-03-29T01:29:59.999Z"), config), null);
  assert.equal(getActiveTicketUrl(new Date("2026-03-29T01:30:00Z"), config), null);
});

void test("rejects an invalid current instant when tickets are enabled", () => {
  getActiveTicketUrl(new Date("2026-01-01T00:00:00Z"), ticketConfig);
  assert.throws(() => getActiveTicketUrl(new Date(Number.NaN), ticketConfig), TypeError);
});

void test("returns no ticket without a URL or an event", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  assert.equal(getActiveTicketUrl(now, { ...ticketConfig, ticketUrl: null }), null);
  assert.equal(getActiveTicketUrl(now, { ...ticketConfig, ticketUrl: undefined }), null);
  assert.equal(getActiveTicketUrl(now, { ...ticketConfig, eventDates: [] }), null);
});

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
