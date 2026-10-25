import type { SessionStore, SessionTransaction } from "@/lib/session-store";
import type { SessionRecord } from "@/lib/session-types";

type State = {
  sessions: Map<string, SessionRecord>;
  activeSessionId: string | null;
};

function cloneSession(session: SessionRecord): SessionRecord {
  return {
    ...session,
    start: new Date(session.start),
    end: session.end ? new Date(session.end) : null,
    pausedAt: session.pausedAt ? new Date(session.pausedAt) : null,
  };
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
  };

  private tail: Promise<void> = Promise.resolve();

  seed(sessions: SessionRecord[], activeSessionId: string | null = null): void {
    this.state = {
      sessions: new Map(
        sessions.map((session) => [session.id, cloneSession(session)]),
      ),
      activeSessionId,
    };
  }

  activeSessionId(): string | null {
    return this.state.activeSessionId;
  }

  sessions(): SessionRecord[] {
    return [...this.state.sessions.values()].map(cloneSession);
  }

  async getActiveSession(): Promise<SessionRecord | null> {
    if (!this.state.activeSessionId) {
      return null;
    }

    const session = this.state.sessions.get(this.state.activeSessionId);
    return session ? cloneSession(session) : null;
  }

  async querySessions(from: Date, to: Date): Promise<SessionRecord[]> {
    return [...this.state.sessions.values()]
      .filter(
        (session) =>
          session.start.getTime() >= from.getTime() &&
          session.start.getTime() <= to.getTime(),
      )
      .map(cloneSession);
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
