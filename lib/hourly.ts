import { roundMinutes } from "./active-time";
import { formatIstIso } from "./ist-dates";
import {
  istHour,
  istWeekdayIndexAt,
  nextIstHour,
} from "./periods";
import type { SessionRecord } from "./session-types";
import { activeSecondsInRange } from "./time-allocation";

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
    const startMs = Math.max(session.start.getTime(), from.getTime());
    const endMs = Math.min(
      session.end?.getTime() ?? now.getTime(),
      now.getTime(),
      to.getTime(),
    );

    if (endMs <= startMs || startMs >= to.getTime()) {
      continue;
    }

    const segmentStart = new Date(startMs);
    const segmentEndLimit = new Date(endMs);
    const sessionActive = activeSecondsInRange(
      session,
      segmentStart,
      segmentEndLimit,
      now,
    );
    if (sessionActive <= 0.5) {
      continue;
    }

    countedSessions += 1;

    let cursor = startMs;
    while (cursor < endMs) {
      const segmentEnd = Math.min(endMs, nextIstHour(cursor));
      const hour = istHour(cursor);
      const weekday = istWeekdayIndexAt(cursor);
      const segmentActive = activeSecondsInRange(
        session,
        new Date(cursor),
        new Date(segmentEnd),
        now,
      );

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
