import assert from "node:assert/strict";
import test from "node:test";

import { parseEventConfig } from "./event-config";

const validConfig = {
  eventDates: ["2026-08-29"],
  cutoffTime: "23:00",
  blockDurationHours: 6,
  timeZone: "Europe/Stockholm",
  message: "Closed",
};

void test("loads operational JSONC comments and trailing commas", () => {
  const source = `{
    // Event policy
    "eventDates": ["2026-08-29",],
    "cutoffTime": "23:00",
    "blockDurationHours": 6,
    "timeZone": "Europe/Stockholm",
    "message": "Closed",
    "ticketUrl": "https://tickets.example.com/event",
  }`;
  assert.deepEqual(parseEventConfig(source), {
    ...validConfig,
    ticketUrl: "https://tickets.example.com/event",
  });
});

void test("reports JSONC syntax errors with filename and line/column", () => {
  assert.throws(() => parseEventConfig('{\n  "eventDates": @\n}', "policy.jsonc"), /policy\.jsonc:2:\d+/);
});

void test("accepts an absent or null ticket URL and no event dates", () => {
  assert.deepEqual(parseEventConfig(JSON.stringify(validConfig)), validConfig);
  assert.deepEqual(parseEventConfig(JSON.stringify({ ...validConfig, eventDates: [], ticketUrl: null })), {
    ...validConfig,
    eventDates: [],
    ticketUrl: null,
  });
});

for (const [field, value] of [
  ["eventDates", ["2026-02-30"]],
  ["eventDates", "2026-08-29"],
  ["cutoffTime", "24:00"],
  ["cutoffTime", "23:60"],
  ["cutoffTime", "9:00"],
  ["blockDurationHours", 0],
  ["blockDurationHours", -1],
  ["blockDurationHours", "6"],
  ["timeZone", "Not/AZone"],
  ["message", null],
  ["ticketUrl", "http://tickets.example.com"],
  ["ticketUrl", "https://"],
  ["ticketUrl", "/tickets"],
  ["ticketUrl", true],
  ["unknown", true],
] as const) {
  void test(`rejects invalid ${field}: ${JSON.stringify(value)}`, () => {
    assert.throws(() => parseEventConfig(JSON.stringify({ ...validConfig, [field]: value })), /event-dates\.jsonc/);
  });
}
