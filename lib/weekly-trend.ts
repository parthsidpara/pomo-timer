import { formatIstIso } from "./ist-dates";
import {
  endOfIstDay,
  istWeekEndKey,
  istWeekStartKey,
  startOfIstDay,
} from "./periods";
import {
  buildPeriodStats,
  type PeriodStats,
} from "./period-stats";
import { canonicalTagDisplays } from "./tags";
import type { SessionRecord } from "./session-types";

export type WeeklyTrendRow = PeriodStats & {
  weekStart: string;
  weekEnd: string;
  partial: boolean;
  deltaFromPreviousWeekMinutes: number | null;
  deltaPercentFromPreviousWeek: number | null;
};

export type WeeklyTrend = {
  rangeStart: string;
  rangeEnd: string;
  asOf: string;
  weeks: WeeklyTrendRow[];
  truncated: boolean;
};

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildWeeklyTrend(
  sessions: SessionRecord[],
  weekStartKeys: string[],
  now: Date,
  truncated: boolean,
): WeeklyTrend {
  const displays = canonicalTagDisplays(sessions);
  const rows: WeeklyTrendRow[] = [];
  let previousMinutes: number | null = null;

  for (const key of weekStartKeys) {
    const from = startOfIstDay(key);
    const weekEndKey = istWeekEndKey(key);
    const weekEnd = endOfIstDay(weekEndKey);
    const partial = now.getTime() < weekEnd.getTime();
    const to = partial ? now : weekEnd;
    const stats = buildPeriodStats(
      sessions,
      from,
      to,
      now,
      displays,
    );
    const delta =
      previousMinutes === null
        ? null
        : roundOne(stats.totalActiveMinutes - previousMinutes);
    const percent =
      previousMinutes === null || previousMinutes === 0
        ? null
        : roundOne(
            ((stats.totalActiveMinutes - previousMinutes) / previousMinutes) *
              100,
          );

    rows.push({
      ...stats,
      weekStart: key,
      weekEnd: weekEndKey,
      partial,
      deltaFromPreviousWeekMinutes: delta,
      deltaPercentFromPreviousWeek: percent,
    });
    previousMinutes = stats.totalActiveMinutes;
  }

  return {
    rangeStart: formatIstIso(startOfIstDay(weekStartKeys[0] ?? istWeekStartKey(now))),
    rangeEnd: formatIstIso(now),
    asOf: formatIstIso(now),
    weeks: rows,
    truncated,
  };
}
