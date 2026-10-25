import type { SessionRecord } from "./session-types";

/**
 * Total paused time in seconds, including an in-progress pause.
 * A stopped session should have pausedAt cleared, but this also handles it.
 */
export function totalPausedSeconds(
  session: SessionRecord,
  at: Date = new Date(),
): number {
  const endMs = session.end?.getTime() ?? at.getTime();
  const storedPaused = Math.max(0, session.pausedSeconds);
  const currentPause = session.pausedAt
    ? Math.max(0, (endMs - session.pausedAt.getTime()) / 1000)
    : 0;

  return storedPaused + currentPause;
}

/**
 * Active time in seconds. While paused, this stays fixed because both the
 * wall-clock span and the current pause grow at the same rate.
 */
export function activeSeconds(
  session: SessionRecord,
  at: Date = new Date(),
): number {
  const endMs = session.end?.getTime() ?? at.getTime();
  const wallSeconds = Math.max(0, (endMs - session.start.getTime()) / 1000);

  return Math.max(0, wallSeconds - totalPausedSeconds(session, at));
}

export function roundMinutes(seconds: number): number {
  return Math.round(Math.max(0, seconds) / 6) / 10;
}

export function activeMinutes(
  session: SessionRecord,
  at: Date = new Date(),
): number {
  return roundMinutes(activeSeconds(session, at));
}

export function pausedMinutes(
  session: SessionRecord,
  at: Date = new Date(),
): number {
  return roundMinutes(totalPausedSeconds(session, at));
}
