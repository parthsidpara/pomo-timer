import type { PauseInterval, SessionRecord } from "./session-types";

function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    return (value as { toDate(): Date }).toDate();
  }

  return null;
}

function toPauseIntervals(value: unknown): PauseInterval[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const intervals: PauseInterval[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const start = toDate((item as { start?: unknown }).start);
    const end = toDate((item as { end?: unknown }).end);

    if (start && end && end.getTime() >= start.getTime()) {
      intervals.push({ start, end });
    }
  }

  return intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Maps a raw `sessions` document into the domain record. This is used by both
 * the browser and the Firebase Admin adapter. A label is optional, so an empty
 * label is a valid session; only the start timestamp is required.
 */
export function mapSessionDocument(
  id: string,
  data: Record<string, unknown> | undefined,
): SessionRecord | null {
  if (!data) {
    return null;
  }

  const start = toDate(data.start);
  if (!start) {
    return null;
  }

  const rawPausedSeconds = data.paused_seconds;

  return {
    id: typeof data.id === "string" ? data.id : id,
    start,
    end: toDate(data.end),
    pausedSeconds:
      typeof rawPausedSeconds === "number" &&
      Number.isFinite(rawPausedSeconds)
        ? Math.max(0, rawPausedSeconds)
        : 0,
    pausedAt: toDate(data.paused_at),
    label: typeof data.label === "string" ? data.label.trim() : "",
    tag:
      typeof data.tag === "string" && data.tag.trim()
        ? data.tag.trim()
        : null,
    pauseIntervals: toPauseIntervals(data.pause_intervals),
  };
}
