export const IST_TIME_ZONE = "Asia/Kolkata";
export const IST_OFFSET_LABEL = "+05:30";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const NAIVE_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/;
const EXPLICIT_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const longDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  weekday: "short",
});

const dayMonthFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  day: "numeric",
  month: "short",
});

export class InvalidDateRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDateRangeError";
  }
}

function istParts(date: Date): Record<string, string> {
  const parts = dateKeyFormatter.formatToParts(date);
  const lookup: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      lookup[part.type] = part.value;
    }
  }

  return lookup;
}

/** The calendar day in Asia/Kolkata, as YYYY-MM-DD. */
export function istDateKey(date: Date): string {
  const parts = istParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** 24-hour clock time in Asia/Kolkata. */
export function formatIstTime(date: Date): string {
  return timeFormatter.format(date);
}

/** ISO 8601 with the Asia/Kolkata offset, e.g. 2026-10-25T14:32:00.000+05:30. */
export function formatIstIso(date: Date): string {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return shifted.toISOString().replace("Z", IST_OFFSET_LABEL);
}

export function formatIstHeaderDate(date: Date): string {
  return longDateFormatter.format(date).replace(",", "").replace("Sept", "Sep");
}

export function formatIstShortDate(date: Date): string {
  return shortDateFormatter.format(date);
}

export function formatIstWeekday(date: Date): string {
  return weekdayFormatter.format(date);
}

export function formatIstDayMonth(date: Date): string {
  // en-GB spells September as "Sept", which is too wide for 8 chart columns.
  return dayMonthFormatter.format(date).replace("Sept", "Sep");
}

export function formatIstDayHeading(
  dayKey: string,
  now: Date = new Date(),
): string {
  if (dayKey === istDateKey(now)) {
    return "Today";
  }

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (dayKey === istDateKey(yesterday)) {
    return "Yesterday";
  }

  const midday = new Date(`${dayKey}T12:00:00+05:30`);
  if (Number.isNaN(midday.getTime())) {
    return dayKey;
  }

  return longDateFormatter.format(midday);
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function parseDateOnly(value: string, edge: "start" | "end"): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (!validCalendarDate(year, month, day)) {
    throw new InvalidDateRangeError(
      `Invalid date "${value}". Use a real calendar date in YYYY-MM-DD form.`,
    );
  }

  const wallTime = edge === "start" ? "00:00:00.000" : "23:59:59.999";
  const parsed = new Date(`${value}T${wallTime}+05:30`);

  if (Number.isNaN(parsed.getTime()) || istDateKey(parsed) !== value) {
    throw new InvalidDateRangeError(
      `Invalid date "${value}". Use a real calendar date in YYYY-MM-DD form.`,
    );
  }

  return parsed;
}

function parseNaiveDateTime(value: string): Date {
  const match = NAIVE_DATETIME.exec(value);
  if (!match) {
    throw new InvalidDateRangeError(
      `Invalid datetime "${value}". Use an ISO 8601 datetime.`,
    );
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? 0);

  if (
    !validCalendarDate(year, month, day) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new InvalidDateRangeError(
      `Invalid datetime "${value}". Check the date and time values.`,
    );
  }

  const parsed = new Date(`${value}+05:30`);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidDateRangeError(
      `Invalid datetime "${value}". Use an ISO 8601 datetime.`,
    );
  }

  return parsed;
}

function parseExplicitInstant(value: string): Date {
  if (!EXPLICIT_ZONE.test(value)) {
    throw new InvalidDateRangeError(
      `Invalid datetime "${value}". Include a timezone, or leave it off to mean IST.`,
    );
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidDateRangeError(
      `Invalid datetime "${value}". Use an ISO 8601 datetime.`,
    );
  }

  return parsed;
}

function parseInput(value: string, field: "from" | "to"): Date {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new InvalidDateRangeError(`"${field}" is required.`);
  }

  if (DATE_ONLY.test(trimmed)) {
    return parseDateOnly(trimmed, field === "from" ? "start" : "end");
  }

  if (NAIVE_DATETIME.test(trimmed)) {
    return parseNaiveDateTime(trimmed);
  }

  return parseExplicitInstant(trimmed);
}

/**
 * Parse a tool/API date range.
 *
 * - A date-only value covers the whole IST day: from 00:00:00.000 through
 *   23:59:59.999.
 * - A datetime without an offset is interpreted as IST.
 * - A datetime with Z or an explicit offset is treated as that instant.
 */
export function parseIstRange(
  from: string,
  to: string,
): { from: Date; to: Date } {
  const fromDate = parseInput(from, "from");
  const toDate = parseInput(to, "to");

  if (fromDate.getTime() > toDate.getTime()) {
    throw new InvalidDateRangeError('"from" must be before or equal to "to".');
  }

  return { from: fromDate, to: toDate };
}

export function formatIstTimeRange(start: Date, end: Date): string {
  if (istDateKey(start) === istDateKey(end)) {
    return `${formatIstTime(start)}–${formatIstTime(end)}`;
  }

  return `${formatIstShortDate(start)} ${formatIstTime(start)}–${formatIstShortDate(end)} ${formatIstTime(end)}`;
}
