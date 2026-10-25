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

export function mapSessionDoc(
  id: string,
  data: Record<string, unknown> | undefined,
): SessionRecord | null {
  if (!data) {
    return null;
  }

  const start = toDate(data.start);
  const label = typeof data.label === "string" ? data.label.trim() : "";

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
    label,
    tag:
      typeof data.tag === "string" && data.tag.trim()
        ? data.tag.trim()
        : null,
  };
}
