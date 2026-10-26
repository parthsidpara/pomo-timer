import { activeSeconds, totalPausedSeconds } from "@/lib/active-time";
import {
  formatIstDayHeading,
  formatIstTimeRange,
  istDateKey,
} from "@/lib/ist-dates";
import { displaySessionLabel } from "@/lib/session-display";
import type { SessionRecord } from "@/lib/session-types";
import { formatDuration, formatPausedTime } from "@/lib/ui-format";
import { BrandMark } from "./brand-mark";

type LedgerProps = {
  sessions: SessionRecord[];
};

type DayGroup = {
  dayKey: string;
  sessions: SessionRecord[];
};

function groupByDay(sessions: SessionRecord[]): DayGroup[] {
  const groups: DayGroup[] = [];

  for (const session of sessions) {
    const dayKey = istDateKey(session.start);
    const current = groups[groups.length - 1];

    if (!current || current.dayKey !== dayKey) {
      groups.push({ dayKey, sessions: [session] });
    } else {
      current.sessions.push(session);
    }
  }

  return groups;
}

export function Ledger({ sessions }: LedgerProps) {
  const groups = groupByDay(sessions);

  return (
    <section className="ledger" aria-labelledby="ledger-title">
      <div className="section-heading">
        <h2 id="ledger-title">Ledger</h2>
        <span>
          {sessions.length} {sessions.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {sessions.length === 0 ? (
        <div className="empty-state">
          <BrandMark className="empty-mark" />
          <h3 className="empty-title">No sessions yet</h3>
          <p className="empty-copy">
            Finished sessions land here. Start one above and stop it whenever
            the work is done.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <div className="ledger-group" key={group.dayKey}>
            <p className="day-heading">{formatIstDayHeading(group.dayKey)}</p>

            <div className="list-card">
              {group.sessions.map((session) => {
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
                            {formatPausedTime(paused)} paused
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
          </div>
        ))
      )}
    </section>
  );
}
