import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { getDb } from "./firebase-admin";
import { mapSessionDocument } from "./session-document";
import type {
  SessionStore,
  SessionTransaction,
} from "./session-store";
import type { SessionRecord } from "./session-types";

const SESSIONS_COLLECTION = "sessions";
const RUNTIME_DOCUMENT = "meta/runtime";
const QUERY_LIMIT = 1000;

function runtimeRef() {
  return getDb().doc(RUNTIME_DOCUMENT);
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
  };
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

    async querySessions(from: Date, to: Date): Promise<SessionRecord[]> {
      const snapshot = await getDb()
        .collection(SESSIONS_COLLECTION)
        .where("start", ">=", Timestamp.fromDate(from))
        .where("start", "<=", Timestamp.fromDate(to))
        .orderBy("start", "asc")
        .limit(QUERY_LIMIT)
        .get();

      return snapshot.docs
        .map((document) => mapSessionDocument(document.id, document.data()))
        .filter((session): session is SessionRecord => session !== null);
    },
  };
}
