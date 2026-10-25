import type { SessionRecord } from "./session-types";

export interface SessionTransaction {
  getActiveSessionId(): Promise<string | null>;
  getSession(id: string): Promise<SessionRecord | null>;
  createSession(session: SessionRecord): Promise<void>;
  updateSession(session: SessionRecord): Promise<void>;
  setActiveSessionId(id: string | null): Promise<void>;
}

export interface SessionStore {
  runTransaction<T>(
    callback: (transaction: SessionTransaction) => Promise<T>,
  ): Promise<T>;
  getActiveSession(): Promise<SessionRecord | null>;
  querySessions(from: Date, to: Date): Promise<SessionRecord[]>;
}
