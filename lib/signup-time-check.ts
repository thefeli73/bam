import eventConfig, { type EventConfig } from "./event-config";
import type { SignupStatus } from "./signup-schema";
import { z } from "zod";

export { signupFormSchema, signupFormClientSchema, type SignupStatus } from "./signup-schema";

let ticketCutoffCache: { start: number; timeZone: string; instant: number } | undefined;

export function getActiveTicketUrl(currentTime: Date, config: EventConfig = eventConfig): string | null {
  if (!config.ticketUrl || config.eventDates.length === 0) {
    return null;
  }
  if (Number.isNaN(currentTime.getTime())) {
    throw new TypeError("Invalid date");
  }

  const latestEventDate = config.eventDates.reduce((latest, date) => (date > latest ? date : latest));
  const { start } = parseEventBlock(latestEventDate, config.cutoffTime, config.blockDurationHours);
  if (ticketCutoffCache?.start !== start || ticketCutoffCache.timeZone !== config.timeZone) {
    ticketCutoffCache = { start, timeZone: config.timeZone, instant: resolveTicketCutoff(start, config.timeZone) };
  }
  return currentTime.getTime() < ticketCutoffCache.instant ? config.ticketUrl : null;
}

type CivilDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getCivilDateTime(instant: Date, timeZone: string): CivilDateTime {
  if (Number.isNaN(instant.getTime())) {
    throw new TypeError("Invalid date");
  }

  const formatter = new Intl.DateTimeFormat("en-CA-u-ca-iso8601-nu-latn", {
    timeZone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function civilDateTimeScalar({ year, month, day, hour, minute, second }: CivilDateTime): number {
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function resolveTicketCutoff(target: number, timeZone: string): number {
  const civilAt = (instant: number) => civilDateTimeScalar(getCivilDateTime(new Date(instant), timeZone));
  // These second-aligned probes cover the offsets around an IANA transition.
  const surrounding = 48 * 60 * 60 * 1000;
  const candidates = [
    ...new Set([target - surrounding, target, target + surrounding].map((probe) => target - (civilAt(probe) - probe))),
  ].sort((a, b) => a - b);
  for (const candidate of candidates) {
    // A repeated cutoff expires at its first occurrence, permanently.
    if (civilAt(candidate) === target) return candidate;
  }

  // A skipped cutoff expires when the clock first jumps past it, not later in the gap.
  let lower = Math.max(...candidates.filter((candidate) => civilAt(candidate) < target));
  let upper = Math.min(...candidates.filter((candidate) => civilAt(candidate) > target));
  while (upper - lower > 1) {
    const middle = Math.floor(lower + (upper - lower) / 2);
    if (civilAt(middle) >= target) upper = middle;
    else lower = middle;
  }
  return upper;
}

function parseEventBlock(
  eventDate: string,
  cutoffTime: string,
  blockDurationHours: number,
): {
  start: number;
  end: number;
} {
  if (!z.iso.date().safeParse(eventDate).success) {
    throw new TypeError(`Invalid event date: ${eventDate}`);
  }

  const cutoff = /^(?<hour>\d{2}):(?<minute>\d{2})$/.exec(cutoffTime);
  const hour = Number(cutoff?.groups?.hour);
  const minute = Number(cutoff?.groups?.minute);
  if (!cutoff || hour > 23 || minute > 59) {
    throw new TypeError(`Invalid cutoff time: ${cutoffTime}`);
  }
  if (!Number.isFinite(blockDurationHours) || blockDurationHours <= 0) {
    throw new TypeError(`Invalid block duration: ${blockDurationHours}`);
  }

  const [year, month, day] = eventDate.split("-").map(Number);
  const start = civilDateTimeScalar({ year, month, day, hour, minute, second: 0 });
  return { start, end: start + blockDurationHours * 60 * 60 * 1000 };
}

export function isInstantWithinEventBlock(
  instant: Date,
  eventDate: string,
  cutoffTime: string,
  blockDurationHours: number,
  timeZone: string,
): boolean {
  const current = civilDateTimeScalar(getCivilDateTime(instant, timeZone));
  const { start, end } = parseEventBlock(eventDate, cutoffTime, blockDurationHours);
  return current >= start && current < end;
}

function formatBoundDate(currentDate: CivilDateTime, yearsAgo: number): string {
  const bound = new Date(Date.UTC(currentDate.year, currentDate.month - 1, currentDate.day));
  bound.setUTCFullYear(currentDate.year - yearsAgo);
  return bound.toISOString().slice(0, 10);
}

export function getSignupDateBounds(currentTime: Date): { oldestDate: string; youngestDate: string } {
  const currentDate = getCivilDateTime(currentTime, eventConfig.timeZone);
  return {
    oldestDate: formatBoundDate(currentDate, 100),
    youngestDate: formatBoundDate(currentDate, 20),
  };
}

export function isSignupDateOfBirthAllowed(dob: string, currentTime: Date): boolean {
  if (!z.iso.date().safeParse(dob).success) {
    return false;
  }

  const { oldestDate, youngestDate } = getSignupDateBounds(currentTime);
  return dob >= oldestDate && dob <= youngestDate;
}

export function isSignupBlocked(currentTime: Date): SignupStatus {
  for (const eventDate of eventConfig.eventDates) {
    if (
      isInstantWithinEventBlock(
        currentTime,
        eventDate,
        eventConfig.cutoffTime,
        eventConfig.blockDurationHours,
        eventConfig.timeZone,
      )
    ) {
      return {
        blocked: true,
        message: eventConfig.message,
      };
    }
  }

  return { blocked: false };
}
