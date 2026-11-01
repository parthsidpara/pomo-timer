import {
  activeSecondsAt,
  pausedSecondsAt,
  roundMinutes,
} from "./active-time";
import { formatIstIso } from "./ist-dates";
import {
  istHour,
  istWeekdayIndexAt,
  nextIstHour,
} from "./periods";
import type { PauseInterval, SessionRecord } from "./session-types";

export type HourlyBucket = {
  hour: number;
  activeSeconds: number;
  activeMinutes: number;
};

export type WeekdayHourRow = {
  weekday: number;
  name: string;
  hours: HourlyBucket[];
  totalActiveMinutes: number;
};

export type HourlySummary = {
  from: string;
  to: string;
  hours: HourlyBucket[];
  totalActiveMinutes: number;
  sessionCount: number;
  weekdayBreakdown: WeekdayHourRow[] | null;
  truncated: boolean;
};

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function overlapSeconds(
  start: number,
  end: number,
  otherStart: number,
  otherEnd: number,
): number {
  return Math.max(
    0,
    (Math.min(end, otherEnd) - Math.max(start, otherStart)) / 1000,
  );
}

function pauseSpans(session: SessionRecord, at: Date): PauseInterval[] {
  const spans = [...(session.pauseIntervals ?? [])];

  if (session.pausedAt) {
    spans.push({ start: session.pausedAt, end: at });
  }

  return spans;
}

function recordedPauseSeconds(
  session: SessionRecord,
  start: number,
  end: number,
): number {
  let seconds = 0;

  for (const span of pauseSpans(session, new Date(end))) {
    seconds += overlapSeconds(
      start,
      end,
      span.start.getTime(),
      span.end.getTime(),
    );
  }

  return seconds;
}

export function buildHourlySummary(
  sessions: SessionRecord[],
  from: Date,
  to: Date,
  now: Date,
  includeWeekdayBreakdown: boolean,
  truncated: boolean,
): HourlySummary {
  const hourSeconds = Array.from({ length: 24 }, () => 0);
  const weekdaySeconds = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );
  let countedSessions = 0;

  for (const session of sessions) {
    const startMs = session.start.getTime();
    const endMs = Math.min(
      session.end?.getTime() ?? now.getTime(),
      now.getTime(),
      to.getTime(),
    );

    if (endMs <= startMs || startMs >= to.getTime()) {
      continue;
    }

    countedSessions += 1;

    const clippedEnd = new Date(endMs);
    const wallSeconds = (endMs - startMs) / 1000;
    const totalActive = activeSecondsAt(session, clippedEnd);
    const storedPaused = pausedSecondsAt(session, clippedEnd);
    const recordedPaused = recordedPauseSeconds(session, startMs, endMs);
    const hasIntervals =
      (session.pauseIntervals?.length ?? 0) > 0 ||
      (session.pausedAt !== null && session.pausedSeconds === 0);
    const exact = hasIntervals || Math.abs(recordedPaused - storedPaused) < 1;
    const ratio = wallSeconds > 0 ? totalActive / wallSeconds : 0;

    let cursor = startMs;
    while (cursor < endMs) {
      const segmentEnd = Math.min(endMs, nextIstHour(cursor));
      const segmentWall = (segmentEnd - cursor) / 1000;
      const hour = istHour(cursor);
      const weekday = istWeekdayIndexAt(cursor);

      let segmentActive: number;
      if (exact) {
        const segmentPaused =
          recordedPauseSeconds(session, cursor, segmentEnd);
        segmentActive = Math.max(0, segmentWall - segmentPaused);
      } else {
        segmentActive = segmentWall * ratio;
      }

      hourSeconds[hour] += segmentActive;
      weekdaySeconds[weekday][hour] += segmentActive;
      cursor = segmentEnd;
    }
  }

  const totalSeconds = hourSeconds.reduce((sum, value) => sum + value, 0);

  return {
    from: formatIstIso(from),
    to: formatIstIso(to),
    hours: hourSeconds.map((seconds, hour) => ({
      hour,
      activeSeconds: Math.round(seconds),
      activeMinutes: roundMinutes(seconds),
    })),
    totalActiveMinutes: roundMinutes(totalSeconds),
    sessionCount: countedSessions,
    weekdayBreakdown: includeWeekdayBreakdown
      ? weekdaySeconds.map((hours, weekday) => {
          const total = hours.reduce((sum, value) => sum + value, 0);
          return {
            weekday,
            name: WEEKDAY_NAMES[weekday],
            hours: hours.map((seconds, hour) => ({
              hour,
              activeSeconds: Math.round(seconds),
              activeMinutes: roundMinutes(seconds),
            })),
            totalActiveMinutes: roundMinutes(total),
          };
        })
      : null,
    truncated,
  };
}
