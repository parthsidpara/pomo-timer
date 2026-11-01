import { beforeEach, describe, expect, it } from "vitest";
import { createSessionService, type SessionService } from "@/lib/session-service";
import type { SessionRecord } from "@/lib/session-types";
import { MemorySessionStore } from "./helpers/memory-store";

const NOW = new Date("2026-11-01T12:00:00+05:30");

function session({
  id,
  start,
  minutes,
  tag,
}: {
  id: string;
  start: string;
  minutes: number;
  tag: string | null;
}): SessionRecord {
  const startDate = new Date(start);
  return {
    id,
    start: startDate,
    end: new Date(startDate.getTime() + minutes * 60_000),
    pausedSeconds: 0,
    pausedAt: null,
    label: id,
    tag,
    pauseIntervals: [],
  };
}

describe("period comparisons", () => {
  let store: MemorySessionStore;
  let service: SessionService;

  beforeEach(() => {
    store = new MemorySessionStore();
    service = createSessionService(store, { now: () => NOW });
    store.seed([
      session({
        id: "a1",
        start: "2026-10-20T09:00:00+05:30",
        minutes: 60,
        tag: "dsa",
      }),
      session({
        id: "a2",
        start: "2026-10-21T09:00:00+05:30",
        minutes: 30,
        tag: null,
      }),
      session({
        id: "b1",
        start: "2026-10-27T09:00:00+05:30",
        minutes: 120,
        tag: "DSA",
      }),
      session({
        id: "b2",
        start: "2026-10-28T09:00:00+05:30",
        minutes: 60,
        tag: "folw",
      }),
    ]);
  });

  it("compares totals, averages, and merged tag deltas", async () => {
    const result = await service.comparePeriods({
      aFrom: new Date("2026-10-19T00:00:00+05:30"),
      aTo: new Date("2026-10-25T23:59:59.999+05:30"),
      bFrom: new Date("2026-10-26T00:00:00+05:30"),
      bTo: new Date("2026-11-01T23:59:59.999+05:30"),
    });

    expect(result.periodA).toMatchObject({
      totalActiveMinutes: 90,
      sessionCount: 2,
      averageSessionMinutes: 45,
      activeDays: 2,
      activeMinutesByTag: {
        DSA: 60,
        "(untagged)": 30,
      },
    });
    expect(result.periodB).toMatchObject({
      totalActiveMinutes: 180,
      sessionCount: 2,
      averageSessionMinutes: 90,
      activeDays: 2,
      activeMinutesByTag: {
        DSA: 120,
        folw: 60,
      },
    });
    expect(result.delta).toMatchObject({
      totalActiveMinutes: 90,
      sessionCount: 0,
      averageSessionMinutes: 45,
    });
    expect(result.deltaPercent.totalActiveMinutes).toBe(100);
    expect(result.tagDeltas[0]).toMatchObject({
      tag: "DSA",
      aMinutes: 60,
      bMinutes: 120,
      deltaMinutes: 60,
      deltaPercent: 100,
    });
    expect(result.truncated).toEqual({ a: false, b: false });
  });

  it("returns one row per week with week-over-week deltas", async () => {
    const trend = await service.weeklyTrend(2);

    expect(trend.weeks).toHaveLength(2);
    expect(trend.weeks[0]).toMatchObject({
      weekStart: "2026-10-19",
      weekEnd: "2026-10-25",
      partial: false,
      totalActiveMinutes: 90,
      sessionCount: 2,
      deltaFromPreviousWeekMinutes: null,
    });
    expect(trend.weeks[1]).toMatchObject({
      weekStart: "2026-10-26",
      weekEnd: "2026-11-01",
      partial: true,
      totalActiveMinutes: 180,
      sessionCount: 2,
      deltaFromPreviousWeekMinutes: 90,
      deltaPercentFromPreviousWeek: 100,
    });
  });

  it("rejects invalid trend lengths", async () => {
    await expect(service.weeklyTrend(0)).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(service.weeklyTrend(53)).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
});
