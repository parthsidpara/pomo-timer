import {
  activeSeconds,
  activeSecondsAt,
  roundMinutes,
  totalPausedSeconds,
} from "./active-time";
import { buildGapAnalysis, type GapAnalysis } from "./gaps";
import { buildGoalProgress, type GoalProgress } from "./goals";
import { buildHourlySummary, type HourlySummary } from "./hourly";
import { formatIstIso, istDateKey } from "./ist-dates";
import {
  buildPeriodComparison,
  buildPeriodStats,
  type PeriodComparison,
} from "./period-stats";
import {
  daysBetweenKeys,
  endOfIstDay,
  istWeekStartKey,
  shiftDateKey,
  startOfIstDay,
} from "./periods";
import { displaySessionLabel } from "./session-display";
import type {
  GoalRecord,
  SessionStore,
  SessionTransaction,
} from "./session-store";
import type {
  PauseInterval,
  SessionRecord,
  StartSessionInput,
} from "./session-types";
import {
  buildWeeklyTrend,
  type WeeklyTrend,
} from "./weekly-trend";
import { canonicalTagDisplays, cleanTag, tagKey } from "./tags";

export type SessionErrorCode =
  | "invalid_input"
  | "already_running"
  | "no_active"
  | "already_paused"
  | "not_paused"
  | "not_found";

export class SessionError extends Error {
  readonly code: SessionErrorCode;
  readonly session?: SessionRecord;

  constructor(
    code: SessionErrorCode,
    message: string,
    session?: SessionRecord,
  ) {
    super(message);
    this.name = "SessionError";
    this.code = code;
    this.session = session;
  }
}

export type SessionServiceOptions = {
  now?: () => Date;
  createId?: () => string;
};

export type ListSessionsInput = {
  from: Date;
  to: Date;
  tag?: string | null;
  minMinutes?: number | null;
};

export type SessionSummary = {
  from: Date;
  to: Date;
  totalActiveMinutes: number;
  sessionCount: number;
  averageSessionMinutes: number | null;
  activeMinutesByDay: Record<string, number>;
  activeMinutesByTag: Record<string, number>;
};

export type UpdateSessionInput = {
  id: string;
  label?: string | null;
  tag?: string | null;
  start?: Date;
  end?: Date;
};

export type UpdateSessionResult = {
  session: SessionRecord;
  adjustedPausedSeconds: boolean;
};

export type DeleteSessionResult = {
  session: SessionRecord;
  wasActive: boolean;
};

export type RetagSessionsInput = {
  from: Date;
  to: Date;
  tag: string;
  onlyUntagged: boolean;
};

export type RetagSessionsResult = {
  from: Date;
  to: Date;
  tag: string;
  onlyUntagged: boolean;
  matchedCount: number;
  updatedCount: number;
  skippedCount: number;
  sessionIds: string[];
  truncated: boolean;
};

export type TagVariant = {
  tag: string;
  sessionCount: number;
};

export type TagSummary = {
  tag: string;
  tagKey: string;
  sessionCount: number;
  activeMinutes: number;
  lastUsed: Date;
  lastSessionId: string;
  variants: TagVariant[];
};

export type ListTagsInput = {
  from?: Date;
  to?: Date;
};

export type ListTagsResult = {
  from: Date | null;
  to: Date | null;
  tags: TagSummary[];
  untaggedSessionCount: number;
  truncated: boolean;
};

export type HourlySummaryInput = {
  from: Date;
  to: Date;
  includeWeekdayBreakdown: boolean;
};

export type GapAnalysisInput = {
  from: Date;
  to: Date;
  minGapMinutes: number;
};

export type ComparePeriodsInput = {
  aFrom: Date;
  aTo: Date;
  bFrom: Date;
  bTo: Date;
};

export type ComparePeriodsResult = PeriodComparison & {
  truncated: { a: boolean; b: boolean };
};

export type SetGoalInput = {
  dailyMinutes: number;
  weeklyMinutes?: number | null;
};

const ANALYTICS_QUERY_LIMIT = 2000;
const GOAL_PROGRESS_MAX_DAYS = 366;

function normalizeLabel(value: string | null | undefined): string {
  const label = value?.trim() ?? "";
  if (label.length > 200) {
    throw new SessionError(
      "invalid_input",
      "Label must be 200 characters or fewer.",
    );
  }
  return label;
}

function normalizeTag(value: string | null | undefined): string | null {
  const tag = cleanTag(value);
  if (!tag) {
    return null;
  }
  if (tag.length > 64) {
    throw new SessionError(
      "invalid_input",
      "Tag must be 64 characters or fewer.",
    );
  }
  return tag;
}

function runningMessage(session: SessionRecord): string {
  return `A session is already running: "${displaySessionLabel(session.label)}". Stop it before starting another.`;
}

function cloneIntervals(
  intervals: PauseInterval[] | undefined,
): PauseInterval[] {
  return (intervals ?? []).map((interval) => ({
    start: new Date(interval.start),
    end: new Date(interval.end),
  }));
}

function intervalSeconds(intervals: PauseInterval[]): number {
  return intervals.reduce(
    (sum, interval) =>
      sum +
      Math.max(
        0,
        (interval.end.getTime() - interval.start.getTime()) / 1000,
      ),
    0,
  );
}

function clipIntervals(
  intervals: PauseInterval[],
  start: Date,
  end: Date,
): PauseInterval[] {
  return intervals
    .map((interval) => ({
      start:
        interval.start.getTime() < start.getTime()
          ? new Date(start)
          : new Date(interval.start),
      end:
        interval.end.getTime() > end.getTime()
          ? new Date(end)
          : new Date(interval.end),
    }))
    .filter(
      (interval) => interval.end.getTime() > interval.start.getTime(),
    );
}

export function createSessionService(
  store: SessionStore,
  options: SessionServiceOptions = {},
) {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => crypto.randomUUID());

  async function requireActive(
    transaction: SessionTransaction,
  ): Promise<SessionRecord> {
    const activeId = await transaction.getActiveSessionId();
    if (!activeId) {
      throw new SessionError("no_active", "No session is running.");
    }

    const session = await transaction.getSession(activeId);
    if (!session || session.end) {
      throw new SessionError("no_active", "No session is running.");
    }

    return session;
  }

  async function startSession(input: StartSessionInput): Promise<SessionRecord> {
    const label = normalizeLabel(input.label);
    const tag = normalizeTag(input.tag);

    return store.runTransaction(async (transaction) => {
      const activeId = await transaction.getActiveSessionId();
      if (activeId) {
        const active = await transaction.getSession(activeId);
        if (active && !active.end) {
          throw new SessionError(
            "already_running",
            runningMessage(active),
            active,
          );
        }
      }

      const startedAt = now();
      const session: SessionRecord = {
        id: createId(),
        start: startedAt,
        end: null,
        pausedSeconds: 0,
        pausedAt: null,
        label,
        tag,
        pauseIntervals: [],
      };

      await transaction.createSession(session);
      await transaction.setActiveSessionId(session.id);
      return session;
    });
  }

  async function pauseSession(): Promise<SessionRecord> {
    return store.runTransaction(async (transaction) => {
      const pausedAt = now();
      const session = await requireActive(transaction);

      if (session.pausedAt) {
        throw new SessionError(
          "already_paused",
          "The session is already paused.",
          session,
        );
      }

      const updated: SessionRecord = { ...session, pausedAt };
      await transaction.updateSession(updated);
      return updated;
    });
  }

  async function resumeSession(): Promise<SessionRecord> {
    return store.runTransaction(async (transaction) => {
      const resumedAt = now();
      const session = await requireActive(transaction);

      if (!session.pausedAt) {
        throw new SessionError(
          "not_paused",
          "The session is not paused.",
          session,
        );
      }

      const pauseLength = Math.max(
        0,
        (resumedAt.getTime() - session.pausedAt.getTime()) / 1000,
      );
      const updated: SessionRecord = {
        ...session,
        pausedAt: null,
        pausedSeconds: session.pausedSeconds + pauseLength,
        pauseIntervals: [
          ...cloneIntervals(session.pauseIntervals),
          { start: new Date(session.pausedAt), end: new Date(resumedAt) },
        ],
      };

      await transaction.updateSession(updated);
      return updated;
    });
  }

  async function stopSession(): Promise<SessionRecord> {
    return store.runTransaction(async (transaction) => {
      const stoppedAt = now();
      const session = await requireActive(transaction);

      const pauseLength = session.pausedAt
        ? Math.max(0, (stoppedAt.getTime() - session.pausedAt.getTime()) / 1000)
        : 0;
      const pauseIntervals = cloneIntervals(session.pauseIntervals);
      if (session.pausedAt) {
        pauseIntervals.push({
          start: new Date(session.pausedAt),
          end: new Date(stoppedAt),
        });
      }

      const updated: SessionRecord = {
        ...session,
        end: stoppedAt,
        pausedAt: null,
        pausedSeconds: session.pausedSeconds + pauseLength,
        pauseIntervals,
      };

      await transaction.updateSession(updated);
      await transaction.setActiveSessionId(null);
      return updated;
    });
  }

  async function currentSession(): Promise<SessionRecord | null> {
    const session = await store.getActiveSession();
    return session && !session.end ? session : null;
  }

  async function listSessions(
    input: ListSessionsInput,
  ): Promise<SessionRecord[]> {
    const sessions = await store.querySessions(input.from, input.to);
    const at = now();
    const filterKey = tagKey(input.tag);
    const minSeconds =
      input.minMinutes === undefined || input.minMinutes === null
        ? null
        : Math.max(0, input.minMinutes) * 60;

    return sessions
      .filter((session) =>
        filterKey ? tagKey(session.tag) === filterKey : true,
      )
      .filter((session) =>
        minSeconds === null
          ? true
          : activeSeconds(session, at) >= minSeconds,
      )
      .sort((a, b) => b.start.getTime() - a.start.getTime());
  }

  async function summarize(from: Date, to: Date): Promise<SessionSummary> {
    const sessions = await store.querySessions(from, to);
    const at = now();
    const displays = canonicalTagDisplays(sessions);
    const byDaySeconds = new Map<string, number>();
    const byTagSeconds = new Map<string, { tag: string; seconds: number }>();
    let totalSeconds = 0;

    for (const session of sessions) {
      const seconds = activeSeconds(session, at);
      const day = istDateKey(session.start);
      const key = tagKey(session.tag) ?? "(untagged)";
      const tag =
        key === "(untagged)"
          ? "(untagged)"
          : (displays.get(key) ?? session.tag ?? key);

      totalSeconds += seconds;
      byDaySeconds.set(day, (byDaySeconds.get(day) ?? 0) + seconds);
      const current = byTagSeconds.get(key) ?? { tag, seconds: 0 };
      current.seconds += seconds;
      byTagSeconds.set(key, current);
    }

    const toRoundedRecord = (values: Map<string, number>) =>
      Object.fromEntries(
        [...values.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, seconds]) => [key, roundMinutes(seconds)]),
      );

    const activeMinutesByTag = Object.fromEntries(
      [...byTagSeconds.values()]
        .sort((a, b) => a.tag.localeCompare(b.tag))
        .map((entry) => [entry.tag, roundMinutes(entry.seconds)]),
    );

    return {
      from,
      to,
      totalActiveMinutes: roundMinutes(totalSeconds),
      sessionCount: sessions.length,
      averageSessionMinutes:
        sessions.length === 0
          ? null
          : roundMinutes(totalSeconds / sessions.length),
      activeMinutesByDay: toRoundedRecord(byDaySeconds),
      activeMinutesByTag,
    };
  }

  async function updateSession(
    input: UpdateSessionInput,
  ): Promise<UpdateSessionResult> {
    if (
      input.label === undefined &&
      input.tag === undefined &&
      input.start === undefined &&
      input.end === undefined
    ) {
      throw new SessionError("invalid_input", "No fields to update.");
    }

    return store.runTransaction(async (transaction) => {
      const current = await transaction.getSession(input.id);
      if (!current) {
        throw new SessionError("not_found", "Session not found.");
      }

      const at = now();
      const label =
        input.label === undefined ? current.label : normalizeLabel(input.label);
      const tag =
        input.tag === undefined ? current.tag : normalizeTag(input.tag);
      const start = input.start ?? current.start;
      const end = input.end !== undefined ? input.end : current.end;

      if (end && end.getTime() < start.getTime()) {
        throw new SessionError(
          "invalid_input",
          'The session end must be after its start.',
        );
      }
      if (start.getTime() > at.getTime()) {
        throw new SessionError(
          "invalid_input",
          "The session start cannot be in the future.",
        );
      }
      if (end && end.getTime() > at.getTime()) {
        throw new SessionError(
          "invalid_input",
          "The session end cannot be in the future.",
        );
      }
      if (
        current.pausedAt &&
        !end &&
        start.getTime() > current.pausedAt.getTime()
      ) {
        throw new SessionError(
          "invalid_input",
          "The session start cannot be after the current pause began.",
        );
      }

      let pausedAt = current.pausedAt
        ? new Date(current.pausedAt)
        : null;
      let pausedSeconds = Math.max(0, current.pausedSeconds);
      let intervals = cloneIntervals(current.pauseIntervals);
      const hadIntervals = intervals.length > 0;
      let adjustedPausedSeconds = false;

      if (pausedAt && end) {
        const pauseEnd =
          end.getTime() > pausedAt.getTime() ? end : pausedAt;
        const pauseLength = Math.max(
          0,
          (pauseEnd.getTime() - pausedAt.getTime()) / 1000,
        );
        if (pauseLength > 0) {
          intervals.push({
            start: new Date(pausedAt),
            end: new Date(pauseEnd),
          });
        }
        pausedSeconds += pauseLength;
        pausedAt = null;
      }

      intervals = clipIntervals(intervals, start, end ?? at);

      if (hadIntervals) {
        const recomputed = intervalSeconds(intervals);
        if (Math.abs(recomputed - pausedSeconds) >= 0.5) {
          adjustedPausedSeconds = true;
        }
        pausedSeconds = recomputed;
      }

      const pauseBoundary = end ?? at;
      const currentPause = pausedAt
        ? Math.max(
            0,
            (pauseBoundary.getTime() - pausedAt.getTime()) / 1000,
          )
        : 0;
      const wallSeconds = Math.max(
        0,
        (pauseBoundary.getTime() - start.getTime()) / 1000,
      );
      const totalPaused = pausedSeconds + currentPause;

      if (totalPaused > wallSeconds) {
        const excess = totalPaused - wallSeconds;
        const nextPaused = Math.max(0, pausedSeconds - excess);
        if (nextPaused !== pausedSeconds) {
          pausedSeconds = nextPaused;
          adjustedPausedSeconds = true;
        }
      }

      const updated: SessionRecord = {
        ...current,
        start,
        end,
        label,
        tag,
        pausedSeconds,
        pausedAt,
        pauseIntervals: intervals,
      };

      if (end) {
        const activeId = await transaction.getActiveSessionId();
        if (activeId === current.id) {
          await transaction.setActiveSessionId(null);
        }
      }

      await transaction.updateSession(updated);
      return { session: updated, adjustedPausedSeconds };
    });
  }

  async function deleteSession(id: string): Promise<DeleteSessionResult> {
    return store.runTransaction(async (transaction) => {
      const session = await transaction.getSession(id);
      if (!session) {
        throw new SessionError("not_found", "Session not found.");
      }

      const activeId = await transaction.getActiveSessionId();
      const wasActive = activeId === id;
      await transaction.deleteSession(id);
      if (wasActive) {
        await transaction.setActiveSessionId(null);
      }

      return { session, wasActive };
    });
  }

  async function retagSessions(
    input: RetagSessionsInput,
  ): Promise<RetagSessionsResult> {
    const tag = normalizeTag(input.tag);
    if (!tag) {
      throw new SessionError("invalid_input", "A target tag is required.");
    }

    const sessions = await store.querySessions(
      input.from,
      input.to,
      ANALYTICS_QUERY_LIMIT,
    );
    const candidates = sessions.filter((session) =>
      input.onlyUntagged ? session.tag === null : true,
    );
    const ids = candidates
      .filter((session) => session.tag !== tag)
      .map((session) => session.id);

    await store.updateSessionsTag(ids, tag);

    return {
      from: input.from,
      to: input.to,
      tag,
      onlyUntagged: input.onlyUntagged,
      matchedCount: candidates.length,
      updatedCount: ids.length,
      skippedCount: candidates.length - ids.length,
      sessionIds: ids,
      truncated: sessions.length >= ANALYTICS_QUERY_LIMIT,
    };
  }

  async function listTags(input: ListTagsInput = {}): Promise<ListTagsResult> {
    const at = now();
    const to = input.to ?? at;
    const from = input.from ?? new Date(0);
    const sessions = await store.querySessions(from, to, 1000);
    const displays = canonicalTagDisplays(sessions);
    const tags = new Map<
      string,
      {
        sessionCount: number;
        activeSeconds: number;
        lastUsed: Date;
        lastSessionId: string;
        variants: Map<string, number>;
      }
    >();
    let untaggedSessionCount = 0;

    for (const session of sessions) {
      const key = tagKey(session.tag);
      if (!key || !session.tag) {
        untaggedSessionCount += 1;
        continue;
      }

      const current = tags.get(key) ?? {
        sessionCount: 0,
        activeSeconds: 0,
        lastUsed: session.start,
        lastSessionId: session.id,
        variants: new Map<string, number>(),
      };

      current.sessionCount += 1;
      current.activeSeconds += activeSecondsAt(
        session,
        new Date(
          Math.min(
            session.end?.getTime() ?? at.getTime(),
            at.getTime(),
            to.getTime(),
          ),
        ),
      );
      if (session.start.getTime() > current.lastUsed.getTime()) {
        current.lastUsed = session.start;
        current.lastSessionId = session.id;
      }
      current.variants.set(
        session.tag,
        (current.variants.get(session.tag) ?? 0) + 1,
      );
      tags.set(key, current);
    }

    const summaries: TagSummary[] = [...tags.entries()]
      .map(([key, value]) => ({
        tag: displays.get(key) ?? key,
        tagKey: key,
        sessionCount: value.sessionCount,
        activeMinutes: roundMinutes(value.activeSeconds),
        lastUsed: value.lastUsed,
        lastSessionId: value.lastSessionId,
        variants: [...value.variants.entries()]
          .map(([tag, sessionCount]) => ({ tag, sessionCount }))
          .sort(
            (a, b) =>
              b.sessionCount - a.sessionCount ||
              a.tag.localeCompare(b.tag),
          ),
      }))
      .sort((a, b) => a.tag.localeCompare(b.tag));

    return {
      from: input.from ?? null,
      to: input.to ?? null,
      tags: summaries,
      untaggedSessionCount,
      truncated: sessions.length >= 1000,
    };
  }

  async function summaryByHour(
    input: HourlySummaryInput,
  ): Promise<HourlySummary> {
    const sessions = await store.querySessions(
      input.from,
      input.to,
      ANALYTICS_QUERY_LIMIT,
    );
    return buildHourlySummary(
      sessions,
      input.from,
      input.to,
      now(),
      input.includeWeekdayBreakdown,
      sessions.length >= ANALYTICS_QUERY_LIMIT,
    );
  }

  async function listGaps(input: GapAnalysisInput): Promise<GapAnalysis> {
    const sessions = await store.querySessions(
      input.from,
      input.to,
      ANALYTICS_QUERY_LIMIT,
    );
    return buildGapAnalysis(
      sessions,
      input.from,
      input.to,
      now(),
      input.minGapMinutes,
      sessions.length >= ANALYTICS_QUERY_LIMIT,
    );
  }

  async function comparePeriods(
    input: ComparePeriodsInput,
  ): Promise<ComparePeriodsResult> {
    const [a, b] = await Promise.all([
      store.querySessions(input.aFrom, input.aTo, ANALYTICS_QUERY_LIMIT),
      store.querySessions(input.bFrom, input.bTo, ANALYTICS_QUERY_LIMIT),
    ]);
    const at = now();
    const displays = canonicalTagDisplays([...a, ...b]);
    const comparison = buildPeriodComparison(
      buildPeriodStats(a, input.aFrom, input.aTo, at, displays),
      buildPeriodStats(b, input.bFrom, input.bTo, at, displays),
    );

    return {
      ...comparison,
      truncated: {
        a: a.length >= ANALYTICS_QUERY_LIMIT,
        b: b.length >= ANALYTICS_QUERY_LIMIT,
      },
    };
  }

  async function weeklyTrend(weeks: number): Promise<WeeklyTrend> {
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
      throw new SessionError(
        "invalid_input",
        "Weeks must be an integer between 1 and 52.",
      );
    }

    const at = now();
    const currentWeek = istWeekStartKey(at);
    const firstWeek = shiftDateKey(currentWeek, -(weeks - 1) * 7);
    const keys = Array.from({ length: weeks }, (_, index) =>
      shiftDateKey(firstWeek, index * 7),
    );
    const sessions = await store.querySessions(
      startOfIstDay(firstWeek),
      at,
      ANALYTICS_QUERY_LIMIT,
    );

    return buildWeeklyTrend(
      sessions,
      keys,
      at,
      sessions.length >= ANALYTICS_QUERY_LIMIT,
    );
  }

  async function setGoal(input: SetGoalInput): Promise<GoalRecord> {
    if (
      !Number.isFinite(input.dailyMinutes) ||
      input.dailyMinutes < 1 ||
      input.dailyMinutes > 1440
    ) {
      throw new SessionError(
        "invalid_input",
        "Daily minutes must be between 1 and 1440.",
      );
    }

    if (
      input.weeklyMinutes !== undefined &&
      input.weeklyMinutes !== null &&
      (!Number.isFinite(input.weeklyMinutes) ||
        input.weeklyMinutes < 1 ||
        input.weeklyMinutes > 10080)
    ) {
      throw new SessionError(
        "invalid_input",
        "Weekly minutes must be between 1 and 10080.",
      );
    }

    const existing = await store.getGoal();
    const weeklyMinutes =
      input.weeklyMinutes === undefined
        ? (existing?.weeklyMinutes ?? null)
        : input.weeklyMinutes;
    const goal: GoalRecord = {
      dailyMinutes: Math.round(input.dailyMinutes),
      weeklyMinutes:
        weeklyMinutes === null ? null : Math.round(weeklyMinutes),
      updatedAt: now(),
    };

    await store.setGoal(goal);
    return goal;
  }

  async function getGoal(): Promise<GoalRecord | null> {
    return store.getGoal();
  }

  async function goalProgress(
    from: Date,
    to: Date,
  ): Promise<GoalProgress> {
    const fromKey = istDateKey(from);
    const toKey = istDateKey(to);

    if (fromKey > toKey) {
      throw new SessionError(
        "invalid_input",
        "The goal range starts after it ends.",
      );
    }
    if (daysBetweenKeys(fromKey, toKey) + 1 > GOAL_PROGRESS_MAX_DAYS) {
      throw new SessionError(
        "invalid_input",
        `Goal progress is limited to ${GOAL_PROGRESS_MAX_DAYS} days.`,
      );
    }

    const at = now();
    const queryFrom = startOfIstDay(fromKey);
    const queryTo = new Date(
      Math.min(endOfIstDay(toKey).getTime(), at.getTime()),
    );
    const goal = await store.getGoal();
    const sessions =
      queryFrom.getTime() > queryTo.getTime()
        ? []
        : await store.querySessions(
            queryFrom,
            queryTo,
            ANALYTICS_QUERY_LIMIT,
          );

    return buildGoalProgress(
      sessions,
      goal,
      fromKey,
      toKey,
      at,
      sessions.length >= ANALYTICS_QUERY_LIMIT,
    );
  }

  return {
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    currentSession,
    listSessions,
    summarize,
    updateSession,
    deleteSession,
    retagSessions,
    listTags,
    summaryByHour,
    listGaps,
    comparePeriods,
    weeklyTrend,
    setGoal,
    getGoal,
    goalProgress,
  };
}

export type SessionService = ReturnType<typeof createSessionService>;

export function sessionTotals(session: SessionRecord, at: Date = new Date()) {
  return {
    activeSeconds: activeSeconds(session, at),
    pausedSeconds: totalPausedSeconds(session, at),
  };
}
