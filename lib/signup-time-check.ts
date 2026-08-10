import eventConfig from "@/event-dates.json";
import { z } from "zod";

export type SignupStatus = { blocked: boolean; message?: string };

const signupFormBase = {
  name: z.string().min(2, { error: "Name is required" }).max(50, { error: "Name is too long" }),
  email: z.email({ error: "Email is invalid" }),
};

export const signupFormSchema = z.object({
  ...signupFormBase,
  dob: z.iso.date(),
});

export const signupFormClientSchema = z.object({
  ...signupFormBase,
  dob: z.date({ error: "Birthday is required" }),
});

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
