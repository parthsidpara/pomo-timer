import { activeSeconds, totalPausedSeconds } from "@/lib/active-time";
import { formatIstTimeRange } from "@/lib/ist-dates";
import { displaySessionLabel } from "@/lib/session-display";
import type { SessionRecord } from "@/lib/session-types";
import { formatDuration } from "@/lib/ui-format";

export function TodaySessions({ sessions }: { sessions: SessionRecord[] }) {
  const count = sessions.length;

  return (
    <section className="today-panel" aria-labelledby="today-sessions-title">
      <div className="chart-head">
        <div>
          <p className="chart-subtitle">Completed · IST</p>
          <h2 id="today-sessions-title" className="chart-title">
            Today’s sessions
          </h2>
        </div>
        <span className="today-count">
          {count} {count === 1 ? "session" : "sessions"}
        </span>
      </div>

      {count === 0 ? (
        <p className="today-empty">No completed sessions today.</p>
      ) : (
        <div className="today-rows">
          {sessions.map((session) => {
            const end = session.end ?? new Date();
            const paused = totalPausedSeconds(session, end);

            return (
              <article className="ledger-row" key={session.id}>
                <div className="ledger-time">
                  {formatIstTimeRange(session.start, end)}
                </div>

                <div className="ledger-body">
                  <h3 className="ledger-label">
                    {displaySessionLabel(session.label)}
                  </h3>
                  {session.tag ? (
                    <span className="ledger-tag">{session.tag}</span>
                  ) : null}
                  {paused >= 1 ? (
                    <span className="ledger-pause">
                      {formatDuration(paused)} paused
                    </span>
                  ) : null}
                </div>

                <div className="ledger-duration">
                  {formatDuration(activeSeconds(session, end))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
