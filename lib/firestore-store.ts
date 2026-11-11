import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { getDb } from "./firebase-admin";
import { mapSessionDocument } from "./session-document";
import type {
  GoalRecord,
  SessionStore,
  SessionTransaction,
} from "./session-store";
import type { SessionRecord } from "./session-types";

const SESSIONS_COLLECTION = "sessions";
const RUNTIME_DOCUMENT = "meta/runtime";
const GOALS_DOCUMENT = "meta/goals";
const QUERY_LIMIT = 1000;
const OVERLAP_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function runtimeRef() {
  return getDb().doc(RUNTIME_DOCUMENT);
}

function goalsRef() {
  return getDb().doc(GOALS_DOCUMENT);
}

function sessionRef(id: string) {
  return getDb().collection(SESSIONS_COLLECTION).doc(id);
}

function toFirestore(session: SessionRecord) {
  return {
    id: session.id,
    start: Timestamp.fromDate(session.start),
    end: session.end ? Timestamp.fromDate(session.end) : null,
    paused_seconds: session.pausedSeconds,
    paused_at: session.pausedAt ? Timestamp.fromDate(session.pausedAt) : null,
    label: session.label,
    tag: session.tag,
    pause_intervals: (session.pauseIntervals ?? []).map((interval) => ({
      start: Timestamp.fromDate(interval.start),
      end: Timestamp.fromDate(interval.end),
    })),
  };
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    return (value as { toDate(): Date }).toDate();
  }

  return null;
}

class AdminSessionTransaction implements SessionTransaction {
  constructor(private readonly transaction: Transaction) {}

  async getActiveSessionId(): Promise<string | null> {
    const snapshot = await this.transaction.get(runtimeRef());
    const value = snapshot.get("active_session_id");
    return typeof value === "string" ? value : null;
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const snapshot = await this.transaction.get(sessionRef(id));
    return mapSessionDocument(snapshot.id, snapshot.data());
  }

  async createSession(session: SessionRecord): Promise<void> {
    this.transaction.set(sessionRef(session.id), toFirestore(session));
  }

  async updateSession(session: SessionRecord): Promise<void> {
    this.transaction.set(sessionRef(session.id), toFirestore(session));
  }

  async deleteSession(id: string): Promise<void> {
    this.transaction.delete(sessionRef(id));
  }

  async setActiveSessionId(id: string | null): Promise<void> {
    this.transaction.set(runtimeRef(), { active_session_id: id });
  }
}

export function createFirestoreStore(): SessionStore {
  return {
    async runTransaction<T>(
      callback: (transaction: SessionTransaction) => Promise<T>,
    ): Promise<T> {
      return getDb().runTransaction(async (transaction) =>
        callback(new AdminSessionTransaction(transaction)),
      );
    },

    async getActiveSession(): Promise<SessionRecord | null> {
      const runtime = await runtimeRef().get();
      const activeId = runtime.get("active_session_id");

      if (typeof activeId !== "string" || !activeId) {
        return null;
      }

      const snapshot = await sessionRef(activeId).get();
      return mapSessionDocument(snapshot.id, snapshot.data());
    },

    async querySessions(
      from: Date,
      to: Date,
      limit = QUERY_LIMIT,
    ): Promise<SessionRecord[]> {
      const snapshot = await getDb()
        .collection(SESSIONS_COLLECTION)
        .where("start", ">=", Timestamp.fromDate(from))
        .where("start", "<=", Timestamp.fromDate(to))
        .orderBy("start", "asc")
        .limit(Math.max(1, Math.floor(limit)))
        .get();

      return snapshot.docs
        .map((document) => mapSessionDocument(document.id, document.data()))
        .filter((session): session is SessionRecord => session !== null);
    },

    async querySessionsOverlapping(
      from: Date,
      to: Date,
      at: Date,
      limit = QUERY_LIMIT,
    ): Promise<SessionRecord[]> {
      const snapshot = await getDb()
        .collection(SESSIONS_COLLECTION)
        .where(
          "start",
          ">=",
          Timestamp.fromDate(
            new Date(from.getTime() - OVERLAP_LOOKBACK_MS),
          ),
        )
        .where("start", "<=", Timestamp.fromDate(to))
        .orderBy("start", "asc")
        .limit(Math.max(1, Math.floor(limit)))
        .get();

      return snapshot.docs
        .map((document) => mapSessionDocument(document.id, document.data()))
        .filter((session): session is SessionRecord => session !== null)
        .filter((session) => {
          const end = session.end ?? at;
          return (
            end.getTime() >= from.getTime() &&
            session.start.getTime() <= at.getTime()
          );
        });
    },

    async updateSessionsTag(ids: string[], tag: string): Promise<void> {
      if (ids.length === 0) {
        return;
      }

      const writer = getDb().bulkWriter();
      for (const id of ids) {
        writer.update(sessionRef(id), { tag });
      }
      await writer.close();
    },

    async getGoal(): Promise<GoalRecord | null> {
      const snapshot = await goalsRef().get();
      if (!snapshot.exists) {
        return null;
      }

      const data = snapshot.data();
      const dailyMinutes = data?.daily_minutes;
      if (
        typeof dailyMinutes !== "number" ||
        !Number.isFinite(dailyMinutes)
      ) {
        return null;
      }

      const weeklyMinutes = data?.weekly_minutes;
      const updatedAt = dateValue(data?.updated_at) ?? new Date(0);

      return {
        dailyMinutes,
        weeklyMinutes:
          typeof weeklyMinutes === "number" && Number.isFinite(weeklyMinutes)
            ? weeklyMinutes
            : null,
        updatedAt,
      };
    },

    async setGoal(goal: GoalRecord): Promise<void> {
      await goalsRef().set({
        daily_minutes: goal.dailyMinutes,
        weekly_minutes: goal.weeklyMinutes,
        updated_at: Timestamp.fromDate(goal.updatedAt),
      });
    },
  };
}
