import { istDateKey } from "./ist-dates";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MS_PER_HOUR = 60 * 60 * 1000;
export const IST_OFFSET_MS = 5.5 * MS_PER_HOUR;

/** Shift a YYYY-MM-DD key by a number of calendar days. */
export function shiftDateKey(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** First instant of an IST calendar day. */
export function startOfIstDay(key: string): Date {
  return new Date(`${key}T00:00:00.000+05:30`);
}

/** Last instant of an IST calendar day, inclusive to the millisecond. */
export function endOfIstDay(key: string): Date {
  return new Date(startOfIstDay(key).getTime() + MS_PER_DAY - 1);
}

/** The Monday date key for the IST week containing `date`. */
export function istWeekStartKey(date: Date): string {
  const key = istDateKey(date);
  const weekday = new Date(`${key}T00:00:00.000Z`).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return shiftDateKey(key, -daysSinceMonday);
}

/** The Sunday date key for the IST week starting on `weekStartKey`. */
export function istWeekEndKey(weekStartKey: string): string {
  return shiftDateKey(weekStartKey, 6);
}

/** Inclusive list of IST date keys from `fromKey` through `toKey`. */
export function eachIstDayKey(fromKey: string, toKey: string): string[] {
  const keys: string[] = [];
  let current = fromKey;

  for (let guard = 0; guard < 10_000 && current <= toKey; guard += 1) {
    keys.push(current);
    current = shiftDateKey(current, 1);
  }

  return keys;
}

/** Number of whole calendar days from one date key to another. */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00.000Z`).getTime();
  const to = new Date(`${toKey}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / MS_PER_DAY);
}

/** The next whole IST hour after `timestamp`, in UTC milliseconds. */
export function nextIstHour(timestamp: number): number {
  const shifted = timestamp + IST_OFFSET_MS;
  const nextHour =
    Math.floor(shifted / MS_PER_HOUR) * MS_PER_HOUR + MS_PER_HOUR;
  return nextHour - IST_OFFSET_MS;
}

/** The IST hour (0-23) containing a UTC timestamp. */
export function istHour(timestamp: number): number {
  return new Date(timestamp + IST_OFFSET_MS).getUTCHours();
}

/** The Monday-based weekday index (0-6) containing a UTC timestamp. */
export function istWeekdayIndexAt(timestamp: number): number {
  return (new Date(timestamp + IST_OFFSET_MS).getUTCDay() + 6) % 7;
}
