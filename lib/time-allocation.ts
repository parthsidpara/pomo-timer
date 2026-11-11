import { activeSecondsAt } from "./active-time";
import { istDateKey } from "./ist-dates";
import {
  eachIstDayKey,
  istWeekEndKey,
  istWeekStartKey,
  shiftDateKey,
  startOfIstDay,
} from "./periods";
import type { PauseInterval, SessionRecord } from "./session-types";

export type DayAllocation = {
  date: string;
  start: Date;
  end: Date;
  activeSeconds: number;
  pausedSeconds: number;
};

export type WeekAllocation = {
  weekStart: string;
  start: Date;
  end: Date;
  activeSeconds: number;
  pausedSeconds: number;
};

function overlapSeconds(
  rangeStart: number,
  rangeEnd: number,
  otherStart: number,
  otherEnd: number,
): number {
  return Math.max(
    0,
    (Math.min(rangeEnd, otherEnd) - Math.max(rangeStart, otherStart)) / 1000,
  );
}

function clippedWindow(
  session: SessionRecord,
  from: Date,
  to: Date,
  at: Date,
): { start: number; end: number } | null {
  const atMs = at.getTime();
  const sessionEnd = Math.min(session.end?.getTime() ?? atMs, atMs);
  const start = Math.max(session.start.getTime(), from.getTime());
  const end = Math.min(sessionEnd, to.getTime());

  return end > start ? { start, end } : null;
}

function pauseOverlapSeconds(
  session: SessionRecord,
  start: number,
  end: number,
  at: Date,
): number {
  const intervals: PauseInterval[] = [...(session.pauseIntervals ?? [])];

  if (session.pausedAt) {
    intervals.push({ start: session.pausedAt, end: at });
  }

  let seconds = 0;
  for (const interval of intervals) {
    seconds += overlapSeconds(
      start,
      end,
      interval.start.getTime(),
      interval.end.getTime(),
    );
  }

  return seconds;
}

/**
 * Active seconds inside an arbitrary window. Sessions with recorded pause
 * intervals are exact; older sessions without interval data fall back to
 * proportional allocation across their wall-clock span.
 */
export function activeSecondsInRange(
  session: SessionRecord,
  from: Date,
  to: Date,
  at: Date = new Date(),
): number {
  const window = clippedWindow(session, from, to, at);
  if (!window) {
    return 0;
  }

  const wallSeconds = (window.end - window.start) / 1000;
  const hasIntervals =
    (session.pauseIntervals?.length ?? 0) > 0 ||
    (session.pausedAt !== null && session.pausedSeconds === 0);

  if (hasIntervals) {
    const paused = pauseOverlapSeconds(session, window.start, window.end, at);
    return Math.max(0, wallSeconds - paused);
  }

  const atMs = at.getTime();
  const sessionEnd = Math.min(session.end?.getTime() ?? atMs, atMs);
  const totalWall = Math.max(0, sessionEnd - session.start.getTime()) / 1000;
  if (totalWall <= 0) {
    return 0;
  }

  const totalActive = activeSecondsAt(session, at);
  return Math.max(0, wallSeconds * (totalActive / totalWall));
}

export function pausedSecondsInRange(
  session: SessionRecord,
  from: Date,
  to: Date,
  at: Date = new Date(),
): number {
  const window = clippedWindow(session, from, to, at);
  if (!window) {
    return 0;
  }

  const wallSeconds = (window.end - window.start) / 1000;
  return Math.max(0, wallSeconds - activeSecondsInRange(session, from, to, at));
}

function allocationsByBoundaries(
  session: SessionRecord,
  from: Date,
  to: Date,
  at: Date,
  boundaries: string[],
  boundaryStart: (key: string) => Date,
  boundaryEnd: (key: string) => Date,
  keyForDate: (date: Date) => string,
): Array<{ key: string; start: Date; end: Date; activeSeconds: number; pausedSeconds: number }> {
  const window = clippedWindow(session, from, to, at);
  if (!window) {
    return [];
  }

  const firstKey = keyForDate(new Date(window.start));
  const lastKey = keyForDate(new Date(window.end));
  const relevant = boundaries.filter((key) => key >= firstKey && key <= lastKey);
  const allocations: Array<{
    key: string;
    start: Date;
    end: Date;
    activeSeconds: number;
    pausedSeconds: number;
  }> = [];

  for (const key of relevant) {
    const rangeStart = boundaryStart(key);
    const rangeEnd = boundaryEnd(key);
    const active = activeSecondsInRange(session, rangeStart, rangeEnd, at);
    const segmentStart = new Date(
      Math.max(window.start, rangeStart.getTime()),
    );
    const segmentEnd = new Date(Math.min(window.end, rangeEnd.getTime()));

    if (active <= 0.5 || segmentEnd <= segmentStart) {
      continue;
    }

    const wallSeconds = (segmentEnd.getTime() - segmentStart.getTime()) / 1000;
    allocations.push({
      key,
      start: segmentStart,
      end: segmentEnd,
      activeSeconds: active,
      pausedSeconds: Math.max(0, wallSeconds - active),
    });
  }

  return allocations;
}

/** Split a session's active time across the IST days inside a window. */
export function allocateSessionByDay(
  session: SessionRecord,
  from: Date,
  to: Date,
  at: Date = new Date(),
): DayAllocation[] {
  const window = clippedWindow(session, from, to, at);
  if (!window) {
    return [];
  }

  const firstKey = istDateKey(new Date(window.start));
  const lastKey = istDateKey(new Date(window.end));

  return allocationsByBoundaries(
    session,
    from,
    to,
    at,
    eachIstDayKey(firstKey, lastKey),
    (key) => startOfIstDay(key),
    (key) => startOfIstDay(shiftDateKey(key, 1)),
    istDateKey,
  ).map((allocation) => ({
    date: allocation.key,
    start: allocation.start,
    end: allocation.end,
    activeSeconds: allocation.activeSeconds,
    pausedSeconds: allocation.pausedSeconds,
  }));
}

/** Split a session's active time across the IST weeks inside a window. */
export function allocateSessionByWeek(
  session: SessionRecord,
  from: Date,
  to: Date,
  at: Date = new Date(),
): WeekAllocation[] {
  const window = clippedWindow(session, from, to, at);
  if (!window) {
    return [];
  }

  const firstKey = istWeekStartKey(new Date(window.start));
  const lastKey = istWeekStartKey(new Date(window.end));
  const weekKeys = eachIstDayKey(firstKey, lastKey).filter(
    (_key, index) => index % 7 === 0,
  );

  return allocationsByBoundaries(
    session,
    from,
    to,
    at,
    weekKeys,
    (key) => startOfIstDay(key),
    (key) =>
      startOfIstDay(shiftDateKey(istWeekEndKey(key), 1)),
    istWeekStartKey,
  ).map((allocation) => ({
    weekStart: allocation.key,
    start: allocation.start,
    end: allocation.end,
    activeSeconds: allocation.activeSeconds,
    pausedSeconds: allocation.pausedSeconds,
  }));
}
