"use client";

import { activeSeconds, totalPausedSeconds } from "@/lib/active-time";
import { formatIstTime } from "@/lib/ist-dates";
import { displaySessionLabel } from "@/lib/session-display";
import type { SessionRecord } from "@/lib/session-types";
import { formatPausedTime, formatTimer } from "@/lib/ui-format";

type PendingAction = "pause" | "resume" | "stop" | null;

type TimerPanelProps = {
  session: SessionRecord;
  now: number;
  pendingAction: PendingAction;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

export function TimerPanel({
  session,
  now,
  pendingAction,
  onPause,
  onResume,
  onStop,
}: TimerPanelProps) {
  const at = new Date(now);
  const elapsed = activeSeconds(session, at);
  const paused = totalPausedSeconds(session, at);
  const isPaused = session.pausedAt !== null;
  const busy = pendingAction !== null;

  return (
    <section
      className={`ticket timer-ticket${isPaused ? " is-paused" : ""}`}
      aria-labelledby="active-session-title"
    >
      <div className="ticket-top">
        <span>{isPaused ? "Session paused" : "Session open"}</span>
        <span className="ticket-ref">
          Ref {session.id.slice(0, 8).toUpperCase()}
        </span>
      </div>

      <div className="status-line" aria-live="polite">
        <span className="status-dot" aria-hidden="true" />
        <span>{isPaused ? "Paused" : "Running"}</span>
      </div>

      <h1 id="active-session-title" className="session-title">
        {displaySessionLabel(session.label)}
      </h1>

      {session.tag ? <span className="tag">{session.tag}</span> : null}

      <time
        className="timer"
        role="timer"
        aria-label={`${formatTimer(elapsed)} of active time`}
      >
        {formatTimer(elapsed)}
      </time>

      <div className="timer-meta">
        <span>Started {formatIstTime(session.start)} IST</span>
        <span aria-hidden="true" className="meta-separator">
          /
        </span>
        <span>
          {paused >= 1 ? `${formatPausedTime(paused)} paused` : "No pauses"}
        </span>
      </div>

      <div className="timer-actions">
        <button
          type="button"
          className={`btn ${isPaused ? "btn-primary" : "btn-ghost"}`}
          onClick={isPaused ? onResume : onPause}
          disabled={busy}
          aria-busy={pendingAction === "pause" || pendingAction === "resume"}
        >
          {pendingAction === "pause"
            ? "Pausing…"
            : pendingAction === "resume"
              ? "Resuming…"
              : isPaused
                ? "Resume"
                : "Pause"}
        </button>

        <button
          type="button"
          className="btn btn-stop"
          onClick={onStop}
          disabled={busy}
          aria-busy={pendingAction === "stop"}
        >
          {pendingAction === "stop" ? "Stopping…" : "Stop"}
        </button>
      </div>
    </section>
  );
}
