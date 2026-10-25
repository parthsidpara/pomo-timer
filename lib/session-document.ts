import type { SessionRecord } from "./session-types";

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
  };
}
