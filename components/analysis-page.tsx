"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { AnalysisView } from "./analysis-view";
import {
  analysisWindowStart,
  buildAnalysisData,
} from "@/lib/analysis";
import { getFirebaseClient } from "@/lib/firebase-client";
import { mapSessionDocument } from "@/lib/session-document";
import type { SessionRecord } from "@/lib/session-types";

const QUERY_LIMIT = 1000;

export function AnalysisPage() {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const windowStartMs = analysisWindowStart(now).getTime();

  useEffect(() => {
    let active = true;
    setSessions(null);
    setError(null);

    let unsubscribe: (() => void) | undefined;

    try {
      const { db } = getFirebaseClient();
      const sessionsQuery = query(
        collection(db, "sessions"),
        where(
          "start",
          ">=",
          Timestamp.fromDate(new Date(windowStartMs)),
        ),
        orderBy("start", "desc"),
        limit(QUERY_LIMIT),
      );

      unsubscribe = onSnapshot(
        sessionsQuery,
        (snapshot) => {
          if (!active) {
            return;
          }

          const next = snapshot.docs
            .map((document) =>
              mapSessionDocument(
                document.id,
                document.data() as Record<string, unknown>,
              ),
            )
            .filter((session): session is SessionRecord => session !== null);

          setSessions(next);
          setError(null);
        },
        (snapshotError) => {
          if (!active) {
            return;
          }

          console.error("Analysis listener failed", snapshotError);
          setError(
            (snapshotError as { code?: string }).code === "permission-denied"
              ? "This account cannot read the analysis data."
              : "Analysis could not load. Firestore will retry automatically.",
          );
        },
      );
    } catch {
      if (active) {
        setError("Analysis could not start. Check the Firebase configuration.");
      }
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [windowStartMs]);

  const analysis = useMemo(
    () => buildAnalysisData(sessions ?? [], now),
    [sessions, now],
  );

  return (
    <AnalysisView
      analysis={analysis}
      loading={sessions === null}
      error={error}
    />
  );
}
