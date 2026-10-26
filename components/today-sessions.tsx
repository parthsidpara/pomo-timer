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
          <h2 id="today-sessions-title" className="chart-title">
            Today’s sessions
          </h2>
          <p className="chart-subtitle">Completed · IST</p>
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
              <article className="session-row" key={session.id}>
                <div className="session-main">
                  <div className="session-time">
                    {formatIstTimeRange(session.start, end)}
                  </div>

                  <div className="session-line">
                    <h3 className="session-label">
                      {displaySessionLabel(session.label)}
                    </h3>
                    {session.tag ? (
                      <span className="session-tag">{session.tag}</span>
                    ) : null}
                    {paused >= 1 ? (
                      <span className="session-pause">
                        {formatDuration(paused)} paused
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="session-duration">
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
