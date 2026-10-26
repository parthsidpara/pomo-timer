import { activeSeconds } from "./active-time";
import { istDateKey } from "./ist-dates";
import type { SessionRecord } from "./session-types";

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
  summary: AnalysisSummary;
  tags: TagTotal[];
  today: SessionRecord[];
  windowStart: Date;
};

function shiftDateKey(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfIstDay(key: string): Date {
  return new Date(`${key}T00:00:00.000+05:30`);
}

export function istWeekStartKey(date: Date): string {
  const key = istDateKey(date);
  const weekday = new Date(`${key}T00:00:00.000Z`).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return shiftDateKey(key, -daysSinceMonday);
}

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
      session.start.getTime() >= start &&
      session.start.getTime() <= end,
  );
}

function sessionActiveSeconds(session: SessionRecord): number {
  return activeSeconds(session, session.end ?? new Date());
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

  for (const session of sessions) {
    if (!session.end) {
      continue;
    }

    const bucket = buckets.get(istDateKey(session.start));
    if (!bucket) {
      continue;
    }

    bucket.activeSeconds += sessionActiveSeconds(session);
    bucket.sessionCount += 1;
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

  for (const session of sessions) {
    if (!session.end) {
      continue;
    }

    const bucket = buckets.get(istWeekStartKey(session.start));
    if (!bucket) {
      continue;
    }

    bucket.activeSeconds += sessionActiveSeconds(session);
    bucket.sessionCount += 1;
  }

  return keys.map((key) => buckets.get(key)!);
}

export function buildAnalysisSummary(
  sessions: SessionRecord[],
  now: Date = new Date(),
): AnalysisSummary {
  const completed = completedSessionsInWindow(sessions, now);
  let totalActiveSeconds = 0;
  let longestActiveSeconds = 0;

  for (const session of completed) {
    const seconds = sessionActiveSeconds(session);
    totalActiveSeconds += seconds;
    longestActiveSeconds = Math.max(longestActiveSeconds, seconds);
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
  const totals = new Map<string, TagTotal>();

  for (const session of completedSessionsInWindow(sessions, now)) {
    const tag = session.tag ?? "(untagged)";
    const current = totals.get(tag) ?? {
      tag,
      activeSeconds: 0,
      sessionCount: 0,
    };

    current.activeSeconds += sessionActiveSeconds(session);
    current.sessionCount += 1;
    totals.set(tag, current);
  }

  return [...totals.values()].sort(
    (a, b) =>
      b.activeSeconds - a.activeSeconds || a.tag.localeCompare(b.tag),
  );
}

export function buildAnalysisData(
  sessions: SessionRecord[],
  now: Date = new Date(),
): AnalysisData {
  return {
    daily: buildDailyBuckets(sessions, now),
    weekly: buildWeeklyBuckets(sessions, now),
    summary: buildAnalysisSummary(sessions, now),
    tags: buildTagTotals(sessions, now),
    today: buildTodaySessions(sessions, now),
    windowStart: analysisWindowStart(now),
  };
}
