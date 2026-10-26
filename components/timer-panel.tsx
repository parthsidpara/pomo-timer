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
      className={`card timer-card${isPaused ? " is-paused" : ""}`}
      aria-labelledby="active-session-title"
    >
      <div className="timer-top">
        <span
          className={`status-pill ${isPaused ? "is-paused" : "is-running"}`}
          aria-live="polite"
        >
          <span className="status-dot" aria-hidden="true" />
          <span>{isPaused ? "Paused" : "Running"}</span>
        </span>
        <span className="session-ref">
          Ref {session.id.slice(0, 8).toUpperCase()}
        </span>
      </div>

      <h1 id="active-session-title" className="session-title">
        {displaySessionLabel(session.label)}
      </h1>

      {session.tag ? <span className="tag">{session.tag}</span> : null}

      <div className="timer-dial">
        <svg
          className="timer-dial-svg"
          viewBox="0 0 300 300"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <circle className="dial-rail" cx="150" cy="150" r="132" />
          <circle
            className="dial-tick dial-tick-minute"
            cx="150"
            cy="150"
            r="142"
            pathLength={60}
          />
          <circle
            className="dial-tick dial-tick-hour"
            cx="150"
            cy="150"
            r="142"
            pathLength={12}
          />
          <line
            className="dial-marker"
            x1="150"
            y1="3"
            x2="150"
            y2="11"
          />
        </svg>

        <time
          className="timer"
          role="timer"
          aria-label={`${formatTimer(elapsed)} of active time`}
        >
          {formatTimer(elapsed)}
        </time>
      </div>

      <div className="timer-meta">
        <span>Started {formatIstTime(session.start)} IST</span>
        <span aria-hidden="true" className="meta-separator">
          ·
        </span>
        <span>
          {paused >= 1 ? `${formatPausedTime(paused)} paused` : "No pauses"}
        </span>
      </div>

      <div className="timer-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={isPaused ? onResume : onPause}
          disabled={busy}
          aria-busy={pendingAction === "pause" || pendingAction === "resume"}
        >
          {pendingAction === "pause" || pendingAction === "resume" ? (
            <span className="spinner" aria-hidden="true" />
          ) : null}
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
          className="btn btn-danger"
          onClick={onStop}
          disabled={busy}
          aria-busy={pendingAction === "stop"}
        >
          {pendingAction === "stop" ? (
            <span className="spinner" aria-hidden="true" />
          ) : null}
          {pendingAction === "stop" ? "Stopping…" : "Stop"}
        </button>
      </div>
    </section>
  );
}
