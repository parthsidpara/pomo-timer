import {
  activeSecondsInRange,
  allocateSessionByDay,
  allocateSessionByWeek,
} from "./time-allocation";
import { istDateKey } from "./ist-dates";
import { shiftDateKey, startOfIstDay, istWeekStartKey } from "./periods";
import { canonicalTagDisplays, tagKey } from "./tags";
import type { SessionRecord } from "./session-types";

export { istWeekStartKey } from "./periods";

export const ANALYSIS_DAYS = 7;
export const ANALYSIS_WEEKS = 8;

export type AnalysisBucket = {
  key: string;
  start: Date;
  activeSeconds: number;
  sessionCount: number;
};

export type AnalysisSummary = {
  totalActiveSeconds: number;
  completedSessionCount: number;
  averageActiveSeconds: number | null;
  longestActiveSeconds: number | null;
};

export type TagTotal = {
  tag: string;
  activeSeconds: number;
  sessionCount: number;
};

export type AnalysisData = {
  daily: AnalysisBucket[];
  weekly: AnalysisBucket[];
  weeks: AnalysisWeek[];
  summary: AnalysisSummary;
  tags: TagTotal[];
  today: SessionRecord[];
  windowStart: Date;
};

export type AnalysisWeek = {
  key: string;
  start: Date;
  days: AnalysisBucket[];
};

export function analysisWindowStart(now: Date): Date {
  const currentWeek = istWeekStartKey(now);
  const firstWeek = shiftDateKey(
    currentWeek,
    -(ANALYSIS_WEEKS - 1) * 7,
  );
  return startOfIstDay(firstWeek);
}

function completedSessionsInWindow(
  sessions: SessionRecord[],
  now: Date,
): SessionRecord[] {
  const start = analysisWindowStart(now).getTime();
  const end = now.getTime();

  return sessions.filter(
    (session) =>
      session.end !== null &&
      session.start.getTime() <= end &&
      session.end.getTime() > start,
  );
}

export function buildDailyBuckets(
  sessions: SessionRecord[],
  now: Date = new Date(),
): AnalysisBucket[] {
  const todayKey = istDateKey(now);
  const keys = Array.from({ length: ANALYSIS_DAYS }, (_, index) =>
    shiftDateKey(todayKey, index - (ANALYSIS_DAYS - 1)),
  );

  const buckets = new Map<string, AnalysisBucket>(
    keys.map((key) => [
      key,
      {
        key,
        start: startOfIstDay(key),
        activeSeconds: 0,
        sessionCount: 0,
      },
    ]),
  );
  const windowStart = analysisWindowStart(now);

  for (const session of sessions) {
    if (!session.end) {
      continue;
    }

    for (const allocation of allocateSessionByDay(
      session,
      windowStart,
      now,
      now,
    )) {
      const bucket = buckets.get(allocation.date);
      if (!bucket) {
        continue;
      }

      bucket.activeSeconds += allocation.activeSeconds;
      bucket.sessionCount += 1;
    }
  }

  return keys.map((key) => buckets.get(key)!);
}

export function buildWeeklyBuckets(
  sessions: SessionRecord[],
  now: Date = new Date(),
): AnalysisBucket[] {
  const currentWeek = istWeekStartKey(now);
  const keys = Array.from({ length: ANALYSIS_WEEKS }, (_, index) =>
    shiftDateKey(
      currentWeek,
      (index - (ANALYSIS_WEEKS - 1)) * 7,
    ),
  );

  const buckets = new Map<string, AnalysisBucket>(
    keys.map((key) => [
      key,
      {
        key,
        start: startOfIstDay(key),
        activeSeconds: 0,
        sessionCount: 0,
      },
    ]),
  );
  const windowStart = analysisWindowStart(now);

  for (const session of sessions) {
    if (!session.end) {
      continue;
    }

    for (const allocation of allocateSessionByWeek(
      session,
      windowStart,
      now,
      now,
    )) {
      const bucket = buckets.get(allocation.weekStart);
      if (!bucket) {
        continue;
      }

      bucket.activeSeconds += allocation.activeSeconds;
      bucket.sessionCount += 1;
    }
  }

  return keys.map((key) => buckets.get(key)!);
}

export function buildAnalysisSummary(
  sessions: SessionRecord[],
  now: Date = new Date(),
): AnalysisSummary {
  const completed = completedSessionsInWindow(sessions, now);
  const windowStart = analysisWindowStart(now);
  let totalActiveSeconds = 0;
  let longestActiveSeconds = 0;

  for (const session of completed) {
    const seconds = activeSecondsInRange(session, windowStart, now, now);
    const fullSeconds = activeSecondsInRange(
      session,
      session.start,
      session.end ?? now,
      now,
    );
    totalActiveSeconds += seconds;
    longestActiveSeconds = Math.max(longestActiveSeconds, fullSeconds);
  }

  return {
    totalActiveSeconds,
    completedSessionCount: completed.length,
    averageActiveSeconds:
      completed.length > 0
        ? Math.round(totalActiveSeconds / completed.length)
        : null,
    longestActiveSeconds:
      completed.length > 0 ? Math.round(longestActiveSeconds) : null,
  };
}

export function buildTodaySessions(
  sessions: SessionRecord[],
  now: Date = new Date(),
): SessionRecord[] {
  const today = istDateKey(now);
  const end = now.getTime();

  return sessions
    .filter(
      (session) =>
        session.end !== null &&
        session.start.getTime() <= end &&
        istDateKey(session.start) === today,
    )
    .sort((a, b) => b.start.getTime() - a.start.getTime());
}

export function buildTagTotals(
  sessions: SessionRecord[],
  now: Date = new Date(),
): TagTotal[] {
  const completed = completedSessionsInWindow(sessions, now);
  const displays = canonicalTagDisplays(completed);
  const windowStart = analysisWindowStart(now);
  const totals = new Map<string, TagTotal>();

  for (const session of completed) {
    const key = tagKey(session.tag) ?? "(untagged)";
    const tag =
      key === "(untagged)"
        ? "(untagged)"
        : (displays.get(key) ?? session.tag ?? key);
    const current = totals.get(key) ?? {
      tag,
      activeSeconds: 0,
      sessionCount: 0,
    };

    current.activeSeconds += activeSecondsInRange(
      session,
      windowStart,
      now,
      now,
    );
    current.sessionCount += 1;
    totals.set(key, current);
  }

  return [...totals.values()].sort(
    (a, b) =>
      b.activeSeconds - a.activeSeconds || a.tag.localeCompare(b.tag),
  );
}

export function buildWeekDetails(
  sessions: SessionRecord[],
  now: Date = new Date(),
): AnalysisWeek[] {
  const currentWeek = istWeekStartKey(now);
  const weekKeys = Array.from({ length: ANALYSIS_WEEKS }, (_, index) =>
    shiftDateKey(
      currentWeek,
      (index - (ANALYSIS_WEEKS - 1)) * 7,
    ),
  );
  const weeks = weekKeys.map((key) => ({
    key,
    start: startOfIstDay(key),
    days: Array.from({ length: 7 }, (_, dayIndex) => {
      const dayKey = shiftDateKey(key, dayIndex);
      return {
        key: dayKey,
        start: startOfIstDay(dayKey),
        activeSeconds: 0,
        sessionCount: 0,
      };
    }),
  }));
  const byDate = new Map<string, AnalysisBucket>();

  for (const week of weeks) {
    for (const day of week.days) {
      byDate.set(day.key, day);
    }
  }

  const windowStart = analysisWindowStart(now);
  for (const session of sessions) {
    if (!session.end) {
      continue;
    }

    for (const allocation of allocateSessionByDay(
      session,
      windowStart,
      now,
      now,
    )) {
      const bucket = byDate.get(allocation.date);
      if (!bucket) {
        continue;
      }

      bucket.activeSeconds += allocation.activeSeconds;
      bucket.sessionCount += 1;
    }
  }

  return weeks;
}

export function buildAnalysisData(
  sessions: SessionRecord[],
  now: Date = new Date(),
): AnalysisData {
  return {
    daily: buildDailyBuckets(sessions, now),
    weekly: buildWeeklyBuckets(sessions, now),
    weeks: buildWeekDetails(sessions, now),
    summary: buildAnalysisSummary(sessions, now),
    tags: buildTagTotals(sessions, now),
    today: buildTodaySessions(sessions, now),
    windowStart: analysisWindowStart(now),
  };
}
