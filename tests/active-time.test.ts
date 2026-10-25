import { describe, expect, it } from "vitest";
import { activeSeconds, totalPausedSeconds } from "@/lib/active-time";
import type { SessionRecord } from "@/lib/session-types";

const start = new Date("2026-10-25T04:00:00.000Z");

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-1",
    start,
    end: null,
    pausedSeconds: 0,
    pausedAt: null,
    label: "Writing",
    tag: null,
    ...overrides,
  };
}

describe("active time", () => {
  it("uses elapsed wall time for a running session", () => {
    const at = new Date(start.getTime() + 60_000);
    expect(activeSeconds(session(), at)).toBe(60);
    expect(totalPausedSeconds(session(), at)).toBe(0);
  });

  it("holds active time steady while paused", () => {
    const pausedAt = new Date(start.getTime() + 60_000);
    const at = new Date(start.getTime() + 5 * 60_000);
    const record = session({ pausedAt, pausedSeconds: 15 });

    expect(activeSeconds(record, at)).toBe(45);
    expect(totalPausedSeconds(record, at)).toBe(255);
  });

  it("subtracts pauses that were already committed after resume", () => {
    const record = session({
      pausedSeconds: 120,
      pausedAt: null,
    });
    const at = new Date(start.getTime() + 5 * 60_000);

    expect(activeSeconds(record, at)).toBe(180);
  });

  it("uses the stored end time for a stopped session", () => {
    const end = new Date(start.getTime() + 10 * 60_000);
    const record = session({
      end,
      pausedSeconds: 90,
      pausedAt: null,
    });
    const longAfter = new Date(start.getTime() + 60 * 60_000);

    expect(activeSeconds(record, longAfter)).toBe(510);
    expect(totalPausedSeconds(record, longAfter)).toBe(90);
  });

  it("includes the final pause when stopped while paused", () => {
    const pausedAt = new Date(start.getTime() + 5 * 60_000);
    const end = new Date(start.getTime() + 8 * 60_000);
    const record = session({
      end,
      pausedAt,
      pausedSeconds: 30,
    });

    expect(totalPausedSeconds(record, end)).toBe(210);
    expect(activeSeconds(record, end)).toBe(270);
  });

  it("never returns negative time for inconsistent records", () => {
    const record = session({
      pausedSeconds: 999,
      pausedAt: new Date(start.getTime() + 1_000),
    });
    const at = new Date(start.getTime() + 2_000);

    expect(activeSeconds(record, at)).toBe(0);
  });
});
