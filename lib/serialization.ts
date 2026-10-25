import {
  activeMinutes,
  activeSeconds,
  pausedMinutes,
} from "./active-time";
import { formatIstIso } from "./ist-dates";
import type { SessionRecord } from "./session-types";

export type SerializedSession = {
  id: string;
  label: string;
  tag: string | null;
  start: string;
  end: string | null;
  active_minutes: number;
  paused_minutes: number;
  active_seconds: number;
  paused: boolean;
};

export function serializeSession(
  session: SessionRecord,
  at: Date = new Date(),
): SerializedSession {
  return {
    id: session.id,
    label: session.label,
    tag: session.tag,
    start: formatIstIso(session.start),
    end: session.end ? formatIstIso(session.end) : null,
    active_minutes: activeMinutes(session, at),
    paused_minutes: pausedMinutes(session, at),
    active_seconds: Math.round(activeSeconds(session, at)),
    paused: session.pausedAt !== null,
  };
}
