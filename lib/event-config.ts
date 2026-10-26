import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import { z } from "zod";

const eventConfigSchema = z.strictObject({
  eventDates: z.array(z.iso.date()),
  cutoffTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  blockDurationHours: z.number().positive(),
  timeZone: z.string().refine((timeZone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone });
      return true;
    } catch {
      return false;
    }
  }, "Invalid time zone"),
  message: z.string(),
  ticketUrl: z.url({ protocol: /^https$/ }).nullish(),
});

export type EventConfig = z.infer<typeof eventConfigSchema>;

export function parseEventConfig(source: string, filename = "event-dates.jsonc"): EventConfig {
  const errors: ParseError[] = [];
  const parsed: unknown = parse(source, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const error = errors[0];
    const precedingLines = source.slice(0, error.offset).split(/\r\n|\r|\n/);
    const line = precedingLines.length;
    const column = precedingLines[line - 1].length + 1;
    throw new SyntaxError(`${filename}:${line}:${column}: ${printParseErrorCode(error.error)}`);
  }

  const result = eventConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new TypeError(`${filename}: ${result.error.message}`);
  }
  return result.data;
}

const eventConfig = parseEventConfig(readFileSync(join(process.cwd(), "event-dates.jsonc"), "utf8"));

export default eventConfig;
