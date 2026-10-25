import {
  activeSeconds,
  roundMinutes,
  totalPausedSeconds,
} from "./active-time";
import { istDateKey } from "./ist-dates";
import { displaySessionLabel } from "./session-display";
import type { SessionStore, SessionTransaction } from "./session-store";
import type { SessionRecord, StartSessionInput } from "./session-types";

export type SessionErrorCode =
  | "invalid_input"
  | "already_running"
  | "no_active"
  | "already_paused"
  | "not_paused";

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
  const tag = value?.trim() ?? "";
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

      const updated: SessionRecord = {
        ...session,
        end: stoppedAt,
        pausedAt: null,
        pausedSeconds: session.pausedSeconds + pauseLength,
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
    const tag = input.tag?.trim() || null;
    const minSeconds =
      input.minMinutes === undefined || input.minMinutes === null
        ? null
        : Math.max(0, input.minMinutes) * 60;

    return sessions
      .filter((session) => (tag ? session.tag === tag : true))
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
    const byDaySeconds = new Map<string, number>();
    const byTagSeconds = new Map<string, number>();
    let totalSeconds = 0;

    for (const session of sessions) {
      const seconds = activeSeconds(session, at);
      const day = istDateKey(session.start);
      const tag = session.tag ?? "(untagged)";

      totalSeconds += seconds;
      byDaySeconds.set(day, (byDaySeconds.get(day) ?? 0) + seconds);
      byTagSeconds.set(tag, (byTagSeconds.get(tag) ?? 0) + seconds);
    }

    const toRoundedRecord = (values: Map<string, number>) =>
      Object.fromEntries(
        [...values.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, seconds]) => [key, roundMinutes(seconds)]),
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
      activeMinutesByTag: toRoundedRecord(byTagSeconds),
    };
  }

  return {
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    currentSession,
    listSessions,
    summarize,
  };
}

export type SessionService = ReturnType<typeof createSessionService>;

export function sessionTotals(session: SessionRecord, at: Date = new Date()) {
  return {
    activeSeconds: activeSeconds(session, at),
    pausedSeconds: totalPausedSeconds(session, at),
  };
}
