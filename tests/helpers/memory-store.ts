import type {
  GoalRecord,
  SessionStore,
  SessionTransaction,
} from "@/lib/session-store";
import type { SessionRecord } from "@/lib/session-types";

type State = {
  sessions: Map<string, SessionRecord>;
  activeSessionId: string | null;
  goal: GoalRecord | null;
};

function cloneSession(session: SessionRecord): SessionRecord {
  return {
    ...session,
    start: new Date(session.start),
    end: session.end ? new Date(session.end) : null,
    pausedAt: session.pausedAt ? new Date(session.pausedAt) : null,
    pauseIntervals: (session.pauseIntervals ?? []).map((interval) => ({
      start: new Date(interval.start),
      end: new Date(interval.end),
    })),
  };
}

function cloneGoal(goal: GoalRecord | null): GoalRecord | null {
  return goal ? { ...goal, updatedAt: new Date(goal.updatedAt) } : null;
}

function cloneState(state: State): State {
  return {
    sessions: new Map(
      [...state.sessions.entries()].map(([id, session]) => [
        id,
        cloneSession(session),
      ]),
    ),
    activeSessionId: state.activeSessionId,
    goal: cloneGoal(state.goal),
  };
}

/**
 * A small transaction-emulating store for service tests. Transactions are
 * serialized so concurrent calls behave like Firestore transactions.
 */
export class MemorySessionStore implements SessionStore {
  private state: State = {
    sessions: new Map(),
    activeSessionId: null,
    goal: null,
  };

  private tail: Promise<void> = Promise.resolve();

  seed(
    sessions: SessionRecord[],
    activeSessionId: string | null = null,
    goal: GoalRecord | null = null,
  ): void {
    this.state = {
      sessions: new Map(
        sessions.map((session) => [session.id, cloneSession(session)]),
      ),
      activeSessionId,
      goal: cloneGoal(goal),
    };
  }

  activeSessionId(): string | null {
    return this.state.activeSessionId;
  }

  sessions(): SessionRecord[] {
    return [...this.state.sessions.values()].map(cloneSession);
  }

  goal(): GoalRecord | null {
    return cloneGoal(this.state.goal);
  }

  async getActiveSession(): Promise<SessionRecord | null> {
    if (!this.state.activeSessionId) {
      return null;
    }

    const session = this.state.sessions.get(this.state.activeSessionId);
    return session ? cloneSession(session) : null;
  }

  async querySessions(
    from: Date,
    to: Date,
    limit = 1000,
  ): Promise<SessionRecord[]> {
    return [...this.state.sessions.values()]
      .filter(
        (session) =>
          session.start.getTime() >= from.getTime() &&
          session.start.getTime() <= to.getTime(),
      )
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, Math.max(1, Math.floor(limit)))
      .map(cloneSession);
  }

  async querySessionsOverlapping(
    from: Date,
    to: Date,
    at: Date,
    limit = 1000,
  ): Promise<SessionRecord[]> {
    const lookback = from.getTime() - 7 * 24 * 60 * 60 * 1000;

    return [...this.state.sessions.values()]
      .filter((session) => {
        const end = session.end ?? at;
        return (
          session.start.getTime() >= lookback &&
          session.start.getTime() <= to.getTime() &&
          end.getTime() >= from.getTime() &&
          session.start.getTime() <= at.getTime()
        );
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, Math.max(1, Math.floor(limit)))
      .map(cloneSession);
  }

  async updateSessionsTag(ids: string[], tag: string): Promise<void> {
    for (const id of ids) {
      const session = this.state.sessions.get(id);
      if (session) {
        this.state.sessions.set(id, cloneSession({ ...session, tag }));
      }
    }
  }

  async getGoal(): Promise<GoalRecord | null> {
    return cloneGoal(this.state.goal);
  }

  async setGoal(goal: GoalRecord): Promise<void> {
    this.state.goal = cloneGoal(goal);
  }

  runTransaction<T>(
    callback: (transaction: SessionTransaction) => Promise<T>,
  ): Promise<T> {
    const operation = this.tail.then(async () => {
      const draft = cloneState(this.state);
      const transaction: SessionTransaction = {
        getActiveSessionId: async () => draft.activeSessionId,
        getSession: async (id) => {
          const session = draft.sessions.get(id);
          return session ? cloneSession(session) : null;
        },
        createSession: async (session) => {
          draft.sessions.set(session.id, cloneSession(session));
        },
        updateSession: async (session) => {
          draft.sessions.set(session.id, cloneSession(session));
        },
        deleteSession: async (id) => {
          draft.sessions.delete(id);
        },
        setActiveSessionId: async (id) => {
          draft.activeSessionId = id;
        },
      };

      const result = await callback(transaction);
      this.state = draft;
      return result;
    });

    this.tail = operation.then(
      () => undefined,
      () => undefined,
    );

    return operation;
  }
}
