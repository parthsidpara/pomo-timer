import type { SessionRecord } from "./session-types";

export type GoalRecord = {
  dailyMinutes: number;
  weeklyMinutes: number | null;
  updatedAt: Date;
};

export interface SessionTransaction {
  getActiveSessionId(): Promise<string | null>;
  getSession(id: string): Promise<SessionRecord | null>;
  createSession(session: SessionRecord): Promise<void>;
  updateSession(session: SessionRecord): Promise<void>;
  deleteSession(id: string): Promise<void>;
  setActiveSessionId(id: string | null): Promise<void>;
}

export interface SessionStore {
  runTransaction<T>(
    callback: (transaction: SessionTransaction) => Promise<T>,
  ): Promise<T>;
  getActiveSession(): Promise<SessionRecord | null>;
  querySessions(
    from: Date,
    to: Date,
    limit?: number,
  ): Promise<SessionRecord[]>;
  querySessionsOverlapping(
    from: Date,
    to: Date,
    at: Date,
    limit?: number,
  ): Promise<SessionRecord[]>;
  updateSessionsTag(ids: string[], tag: string): Promise<void>;
  getGoal(): Promise<GoalRecord | null>;
  setGoal(goal: GoalRecord): Promise<void>;
}
