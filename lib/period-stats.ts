import { roundMinutes } from "./active-time";
import { formatIstIso } from "./ist-dates";
import { canonicalTagDisplays, tagKey } from "./tags";
import type { SessionRecord } from "./session-types";
import {
  activeSecondsInRange,
  allocateSessionByDay,
} from "./time-allocation";

export type PeriodStats = {
  from: string;
  to: string;
  totalActiveMinutes: number;
  sessionCount: number;
  completedSessionCount: number;
  runningSessionCount: number;
  averageSessionMinutes: number | null;
  longestSessionMinutes: number | null;
  activeDays: number;
  activeMinutesByTag: Record<string, number>;
};

export type ComparisonDelta = {
  totalActiveMinutes: number;
  sessionCount: number;
  completedSessionCount: number;
  averageSessionMinutes: number | null;
  longestSessionMinutes: number | null;
  activeDays: number;
};

export type ComparisonDeltaPercent = {
  totalActiveMinutes: number | null;
  sessionCount: number | null;
  completedSessionCount: number | null;
  averageSessionMinutes: number | null;
  longestSessionMinutes: number | null;
  activeDays: number | null;
};

export type TagDelta = {
  tag: string;
  aMinutes: number;
  bMinutes: number;
  deltaMinutes: number;
  deltaPercent: number | null;
};

export type PeriodComparison = {
  periodA: PeriodStats;
  periodB: PeriodStats;
  delta: ComparisonDelta;
  deltaPercent: ComparisonDeltaPercent;
  tagDeltas: TagDelta[];
};

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function deltaPercent(from: number, to: number): number | null {
  return from === 0 ? null : roundOne(((to - from) / from) * 100);
}

export function buildPeriodStats(
  sessions: SessionRecord[],
  from: Date,
  to: Date,
  now: Date,
  displays?: Map<string, string>,
): PeriodStats {
  const at = new Date(Math.min(to.getTime(), now.getTime()));
  const inPeriod = sessions.filter(
    (session) =>
      session.start.getTime() <= at.getTime() &&
      (session.end?.getTime() ?? at.getTime()) >= from.getTime(),
  );
  const tagDisplays = displays ?? canonicalTagDisplays(inPeriod);
  const tagSeconds = new Map<string, { tag: string; seconds: number }>();
  const activeDays = new Set<string>();
  let totalSeconds = 0;
  let longestSeconds = 0;
  let completed = 0;
  let running = 0;

  for (const session of inPeriod) {
    const seconds = activeSecondsInRange(session, from, at, now);
    totalSeconds += seconds;
    longestSeconds = Math.max(longestSeconds, seconds);

    for (const allocation of allocateSessionByDay(
      session,
      from,
      at,
      now,
    )) {
      activeDays.add(allocation.date);
    }

    if (session.end) {
      completed += 1;
    } else {
      running += 1;
    }

    const key = tagKey(session.tag) ?? "(untagged)";
    const tag =
      key === "(untagged)"
        ? "(untagged)"
        : (tagDisplays.get(key) ?? session.tag ?? key);
    const current = tagSeconds.get(key) ?? { tag, seconds: 0 };
    current.seconds += seconds;
    tagSeconds.set(key, current);
  }

  const activeMinutesByTag = Object.fromEntries(
    [...tagSeconds.values()]
      .sort((a, b) => a.tag.localeCompare(b.tag))
      .map((entry) => [entry.tag, roundMinutes(entry.seconds)]),
  );

  return {
    from: formatIstIso(from),
    to: formatIstIso(to),
    totalActiveMinutes: roundMinutes(totalSeconds),
    sessionCount: completed + running,
    completedSessionCount: completed,
    runningSessionCount: running,
    averageSessionMinutes:
      completed + running > 0
        ? roundMinutes(totalSeconds / (completed + running))
        : null,
    longestSessionMinutes:
      completed + running > 0 ? roundMinutes(longestSeconds) : null,
    activeDays: activeDays.size,
    activeMinutesByTag,
  };
}

export function buildPeriodComparison(
  periodA: PeriodStats,
  periodB: PeriodStats,
): PeriodComparison {
  const averageDelta =
    periodA.averageSessionMinutes === null ||
    periodB.averageSessionMinutes === null
      ? null
      : roundOne(
          periodB.averageSessionMinutes - periodA.averageSessionMinutes,
        );
  const longestDelta =
    periodA.longestSessionMinutes === null ||
    periodB.longestSessionMinutes === null
      ? null
      : roundOne(periodB.longestSessionMinutes - periodA.longestSessionMinutes);

  const tags = new Map<
    string,
    { tag: string; aMinutes: number; bMinutes: number }
  >();

  for (const [tag, minutes] of Object.entries(
    periodA.activeMinutesByTag,
  )) {
    const key = tagKey(tag) ?? tag;
    tags.set(key, { tag, aMinutes: minutes, bMinutes: 0 });
  }
  for (const [tag, minutes] of Object.entries(
    periodB.activeMinutesByTag,
  )) {
    const key = tagKey(tag) ?? tag;
    const current = tags.get(key);
    if (current) {
      current.bMinutes = minutes;
    } else {
      tags.set(key, { tag, aMinutes: 0, bMinutes: minutes });
    }
  }

  const tagDeltas = [...tags.values()]
    .map((entry) => ({
      tag: entry.tag,
      aMinutes: entry.aMinutes,
      bMinutes: entry.bMinutes,
      deltaMinutes: roundOne(entry.bMinutes - entry.aMinutes),
      deltaPercent: deltaPercent(entry.aMinutes, entry.bMinutes),
    }))
    .sort(
      (a, b) =>
        Math.max(b.aMinutes, b.bMinutes) -
          Math.max(a.aMinutes, a.bMinutes) ||
        a.tag.localeCompare(b.tag),
    );

  return {
    periodA,
    periodB,
    delta: {
      totalActiveMinutes: roundOne(
        periodB.totalActiveMinutes - periodA.totalActiveMinutes,
      ),
      sessionCount: periodB.sessionCount - periodA.sessionCount,
      completedSessionCount:
        periodB.completedSessionCount - periodA.completedSessionCount,
      averageSessionMinutes: averageDelta,
      longestSessionMinutes: longestDelta,
      activeDays: periodB.activeDays - periodA.activeDays,
    },
    deltaPercent: {
      totalActiveMinutes: deltaPercent(
        periodA.totalActiveMinutes,
        periodB.totalActiveMinutes,
      ),
      sessionCount: deltaPercent(
        periodA.sessionCount,
        periodB.sessionCount,
      ),
      completedSessionCount: deltaPercent(
        periodA.completedSessionCount,
        periodB.completedSessionCount,
      ),
      averageSessionMinutes:
        periodA.averageSessionMinutes === null ||
        periodB.averageSessionMinutes === null
          ? null
          : deltaPercent(
              periodA.averageSessionMinutes,
              periodB.averageSessionMinutes,
            ),
      longestSessionMinutes:
        periodA.longestSessionMinutes === null ||
        periodB.longestSessionMinutes === null
          ? null
          : deltaPercent(
              periodA.longestSessionMinutes,
              periodB.longestSessionMinutes,
            ),
      activeDays: deltaPercent(periodA.activeDays, periodB.activeDays),
    },
    tagDeltas,
  };
}
