import { describe, expect, it } from "vitest";
import { mapSessionDocument } from "@/lib/session-document";

function timestamp(iso: string) {
  return {
    toDate: () => new Date(iso),
  };
}

describe("shared session document mapper", () => {
  it("keeps an untitled session visible and usable", () => {
    const start = "2026-10-25T11:30:00.000Z";
    const session = mapSessionDocument("session-id", {
      id: "session-id",
      start: timestamp(start),
      end: null,
      paused_seconds: 0,
      paused_at: null,
      label: "",
      tag: "",
    });

    expect(session).not.toBeNull();
    expect(session?.label).toBe("");
    expect(session?.tag).toBeNull();
    expect(session?.start.toISOString()).toBe(start);
    expect(session?.end).toBeNull();
  });

  it("maps recorded pause intervals", () => {
    const session = mapSessionDocument("session-id", {
      id: "session-id",
      start: timestamp("2026-10-25T11:30:00.000Z"),
      end: timestamp("2026-10-25T13:00:00.000Z"),
      paused_seconds: 600,
      paused_at: null,
      label: "Paused",
      tag: "dsa",
      pause_intervals: [
        {
          start: timestamp("2026-10-25T12:00:00.000Z"),
          end: timestamp("2026-10-25T12:10:00.000Z"),
        },
      ],
    });

    expect(session?.pauseIntervals).toHaveLength(1);
    expect(session?.pauseIntervals?.[0].start.toISOString()).toBe(
      "2026-10-25T12:00:00.000Z",
    );
  });

  it("drops documents without a usable start timestamp", () => {
    expect(
      mapSessionDocument("broken", {
        label: "Missing start",
        end: null,
      }),
    ).toBeNull();
  });
});
