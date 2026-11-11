import { roundMinutes } from "./active-time";
import { formatIstIso, istDateKey } from "./ist-dates";
import type { SessionRecord } from "./session-types";
import {
  allocateSessionByDay,
  pausedSecondsInRange,
} from "./time-allocation";

export type Gap = {
  afterSessionId: string;
  beforeSessionId: string;
  end: string;
  start: string;
  gapMinutes: number;
  sameDay: boolean;
};

export type Overlap = {
  afterSessionId: string;
  beforeSessionId: string;
  overlapMinutes: number;
};

export type DaySpan = {
  date: string;
  firstStart: string;
  lastEnd: string;
  spanMinutes: number;
  activeMinutes: number;
  pausedMinutes: number;
  focusRatio: number | null;
  sessionCount: number;
};

export type TimelineSession = {
  id: string;
  label: string;
  tag: string | null;
  start: string;
  end: string;
  activeMinutes: number;
  pausedMinutes: number;
  running: boolean;
};

export type GapAnalysis = {
  from: string;
  to: string;
  gaps: Gap[];
  overlaps: Overlap[];
  daySpans: DaySpan[];
  sessions: TimelineSession[];
  medianBreakMinutes: number | null;
  medianAllGapMinutes: number | null;
  overnightGapCount: number;
  pausedSessionCount: number;
  pauseEventCount: number;
  totalPausedMinutes: number;
  sessionCount: number;
  truncated: boolean;
};

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildGapAnalysis(
  sessions: SessionRecord[],
  from: Date,
  to: Date,
  now: Date,
  minGapMinutes: number,
  truncated: boolean,
): GapAnalysis {
  const sorted = [...sessions].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const gaps: Gap[] = [];
  const overlaps: Overlap[] = [];
  const timeline: TimelineSession[] = [];
  const dayMap = new Map<
    string,
    {
      date: string;
      firstStart: Date;
      lastEnd: Date;
      activeSeconds: number;
      pausedSeconds: number;
      sessionCount: number;
    }
  >();

  let pausedSessionCount = 0;
  let pauseEventCount = 0;
  let pausedSecondsTotal = 0;
  let countedSessions = 0;

  for (const session of sorted) {
    const end = new Date(
      Math.min(
        session.end?.getTime() ?? now.getTime(),
        now.getTime(),
        to.getTime(),
      ),
    );
    if (end.getTime() <= session.start.getTime()) {
      continue;
    }

    const paused = pausedSecondsInRange(session, from, to, now);
    const allocations = allocateSessionByDay(session, from, to, now);

    if (allocations.length === 0) {
      continue;
    }

    countedSessions += 1;

    if (paused >= 1) {
      pausedSessionCount += 1;
    }
    pausedSecondsTotal += paused;
    pauseEventCount +=
      (session.pauseIntervals?.length ?? 0) +
      (session.pausedAt ? 1 : 0);

    for (const allocation of allocations) {
      timeline.push({
        id: session.id,
        label: session.label,
        tag: session.tag,
        start: formatIstIso(allocation.start),
        end: formatIstIso(allocation.end),
        activeMinutes: roundMinutes(allocation.activeSeconds),
        pausedMinutes: roundMinutes(allocation.pausedSeconds),
        running: session.end === null,
      });

      const day = dayMap.get(allocation.date);

      if (!day) {
        dayMap.set(allocation.date, {
          date: allocation.date,
          firstStart: allocation.start,
          lastEnd: allocation.end,
          activeSeconds: allocation.activeSeconds,
          pausedSeconds: allocation.pausedSeconds,
          sessionCount: 1,
        });
      } else {
        if (allocation.start < day.firstStart) {
          day.firstStart = allocation.start;
        }
        if (allocation.end > day.lastEnd) {
          day.lastEnd = allocation.end;
        }
        day.activeSeconds += allocation.activeSeconds;
        day.pausedSeconds += allocation.pausedSeconds;
        day.sessionCount += 1;
      }
    }
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    const currentEnd = new Date(
      Math.min(
        current.end?.getTime() ?? now.getTime(),
        now.getTime(),
        to.getTime(),
      ),
    );
    const gapSeconds =
      (next.start.getTime() - currentEnd.getTime()) / 1000;

    if (gapSeconds < 0) {
      overlaps.push({
        afterSessionId: current.id,
        beforeSessionId: next.id,
        overlapMinutes: roundMinutes(Math.abs(gapSeconds)),
      });
      continue;
    }

    if (gapSeconds < minGapMinutes * 60) {
      continue;
    }

    const sameDay = istDateKey(currentEnd) === istDateKey(next.start);
    gaps.push({
      afterSessionId: current.id,
      beforeSessionId: next.id,
      end: formatIstIso(currentEnd),
      start: formatIstIso(next.start),
      gapMinutes: roundMinutes(gapSeconds),
      sameDay,
    });
  }

  const sameDayGapMinutes = gaps
    .filter((gap) => gap.sameDay)
    .map((gap) => gap.gapMinutes);
  const allGapMinutes = gaps.map((gap) => gap.gapMinutes);

  const daySpans = [...dayMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      const spanSeconds =
        (day.lastEnd.getTime() - day.firstStart.getTime()) / 1000;

      return {
        date: day.date,
        firstStart: formatIstIso(day.firstStart),
        lastEnd: formatIstIso(day.lastEnd),
        spanMinutes: roundMinutes(spanSeconds),
        activeMinutes: roundMinutes(day.activeSeconds),
        pausedMinutes: roundMinutes(day.pausedSeconds),
        focusRatio:
          spanSeconds > 0
            ? Math.round((day.activeSeconds / spanSeconds) * 1000) / 1000
            : null,
        sessionCount: day.sessionCount,
      };
    });

  return {
    from: formatIstIso(from),
    to: formatIstIso(to),
    gaps,
    overlaps,
    daySpans,
    sessions: timeline,
    medianBreakMinutes: median(sameDayGapMinutes),
    medianAllGapMinutes: median(allGapMinutes),
    overnightGapCount: gaps.filter((gap) => !gap.sameDay).length,
    pausedSessionCount,
    pauseEventCount,
    totalPausedMinutes: roundMinutes(pausedSecondsTotal),
    sessionCount: countedSessions,
    truncated,
  };
}
