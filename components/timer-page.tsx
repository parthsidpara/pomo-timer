"use client";

import { useEffect, useMemo, useState } from "react";
import { Ledger } from "./ledger";
import { StartForm } from "./start-form";
import { TimerPanel } from "./timer-panel";
import { useWorklog } from "./worklog-context";
import type { SessionRecord } from "@/lib/session-types";

export function TimerPage() {
  const {
    user,
    sessions,
    syncError,
    actionError,
    pending,
    mutate,
    startSession,
    signOut,
  } = useWorklog();
  const [now, setNow] = useState(() => Date.now());

  const activeSession = useMemo(
    () => sessions.find((session) => session.end === null) ?? null,
    [sessions],
  );

  const completedSessions = useMemo(
    () =>
      sessions.filter(
        (session): session is SessionRecord => session.end !== null,
      ),
    [sessions],
  );

  useEffect(() => {
    if (!activeSession) {
      return;
    }

    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeSession]);

  return (
    <main className="main">
      {activeSession ? (
        <TimerPanel
          session={activeSession}
          now={now}
          pendingAction={pending === "start" ? null : pending}
          onPause={() => void mutate("pause")}
          onResume={() => void mutate("resume")}
          onStop={() => void mutate("stop")}
        />
      ) : (
        <StartForm onStart={startSession} pending={pending === "start"} />
      )}

      {actionError ? (
        <p className="banner banner-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {syncError ? (
        <p className="banner banner-warning" role="status">
          {syncError}
        </p>
      ) : null}

      <Ledger sessions={completedSessions} />

      <footer className="account-footer">
        <span className="account-email">{user.email}</span>
        <button type="button" className="text-button" onClick={signOut}>
          Sign out
        </button>
      </footer>
    </main>
  );
}
