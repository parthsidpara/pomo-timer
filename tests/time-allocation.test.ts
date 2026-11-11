import { describe, expect, it } from "vitest";
import type { SessionRecord } from "@/lib/session-types";
import {
  activeSecondsInRange,
  allocateSessionByDay,
  allocateSessionByWeek,
  pausedSecondsInRange,
} from "@/lib/time-allocation";

const AT = new Date("2026-11-02T12:00:00+05:30");

function session(
  overrides: Partial<SessionRecord> & Pick<SessionRecord, "start" | "end">,
): SessionRecord {
  return {
    id: "session",
    pausedSeconds: 0,
    pausedAt: null,
    label: "Session",
    tag: null,
    pauseIntervals: [],
    ...overrides,
  };
}

describe("time allocation", () => {
  it("splits a cross-midnight session into one hour per IST day", () => {
    const record = session({
      start: new Date("2026-10-31T23:00:00+05:30"),
      end: new Date("2026-11-01T01:00:00+05:30"),
    });

    const allocations = allocateSessionByDay(
      record,
      new Date("2026-10-31T00:00:00+05:30"),
      new Date("2026-11-01T23:59:59.999+05:30"),
      AT,
    );

    expect(
      Object.fromEntries(
        allocations.map((allocation) => [
          allocation.date,
          allocation.activeSeconds,
        ]),
      ),
    ).toEqual({
      "2026-10-31": 3600,
      "2026-11-01": 3600,
    });
  });

  it("splits a Sunday-night session across two weeks", () => {
    const record = session({
      start: new Date("2026-10-25T23:00:00+05:30"),
      end: new Date("2026-10-26T01:00:00+05:30"),
    });

    const allocations = allocateSessionByWeek(
      record,
      new Date("2026-10-19T00:00:00+05:30"),
      new Date("2026-10-26T23:59:59.999+05:30"),
      AT,
    );

    expect(
      Object.fromEntries(
        allocations.map((allocation) => [
          allocation.weekStart,
          allocation.activeSeconds,
        ]),
      ),
    ).toEqual({
      "2026-10-19": 3600,
      "2026-10-26": 3600,
    });
  });

  it("subtracts a pause that spans midnight from both days", () => {
    const record = session({
      start: new Date("2026-10-31T22:30:00+05:30"),
      end: new Date("2026-11-01T01:30:00+05:30"),
      pausedSeconds: 3600,
      pauseIntervals: [
        {
          start: new Date("2026-10-31T23:30:00+05:30"),
          end: new Date("2026-11-01T00:30:00+05:30"),
        },
      ],
    });

    const allocations = allocateSessionByDay(
      record,
      new Date("2026-10-31T00:00:00+05:30"),
      new Date("2026-11-01T23:59:59.999+05:30"),
      AT,
    );

    expect(
      Object.fromEntries(
        allocations.map((allocation) => [
          allocation.date,
          allocation.activeSeconds,
        ]),
      ),
    ).toEqual({
      "2026-10-31": 3600,
      "2026-11-01": 3600,
    });
  });

  it("uses proportional allocation for older sessions without intervals", () => {
    const record = session({
      start: new Date("2026-10-31T22:00:00+05:30"),
      end: new Date("2026-11-01T02:00:00+05:30"),
      pausedSeconds: 3600,
    });

    const allocations = allocateSessionByDay(
      record,
      new Date("2026-10-31T00:00:00+05:30"),
      new Date("2026-11-01T23:59:59.999+05:30"),
      AT,
    );

    expect(allocations[0]?.activeSeconds).toBe(5400);
    expect(allocations[1]?.activeSeconds).toBe(5400);
  });

  it("clips to an arbitrary window and reports paused time", () => {
    const record = session({
      start: new Date("2026-10-31T23:00:00+05:30"),
      end: new Date("2026-11-01T01:00:00+05:30"),
    });
    const from = new Date("2026-11-01T00:30:00+05:30");
    const to = new Date("2026-11-01T01:00:00+05:30");

    expect(activeSecondsInRange(record, from, to, AT)).toBe(1800);
    expect(pausedSecondsInRange(record, from, to, AT)).toBe(0);
  });
});
