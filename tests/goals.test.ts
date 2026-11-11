import { beforeEach, describe, expect, it } from "vitest";
import { createSessionService, type SessionService } from "@/lib/session-service";
import type { SessionRecord } from "@/lib/session-types";
import { MemorySessionStore } from "./helpers/memory-store";

const NOW = new Date("2026-11-01T12:00:00+05:30");

function session({
  id,
  start,
  minutes,
}: {
  id: string;
  start: string;
  minutes: number;
}): SessionRecord {
  const startDate = new Date(start);
  return {
    id,
    start: startDate,
    end: new Date(startDate.getTime() + minutes * 60_000),
    pausedSeconds: 0,
    pausedAt: null,
    label: id,
    tag: null,
    pauseIntervals: [],
  };
}

describe("goals", () => {
  let store: MemorySessionStore;
  let service: SessionService;

  beforeEach(() => {
    store = new MemorySessionStore();
    service = createSessionService(store, { now: () => NOW });
  });

  it("stores daily and weekly targets, preserving omitted weekly values", async () => {
    const first = await service.setGoal({
      dailyMinutes: 60,
      weeklyMinutes: 300,
    });
    expect(first).toMatchObject({
      dailyMinutes: 60,
      weeklyMinutes: 300,
      updatedAt: NOW,
    });

    const second = await service.setGoal({ dailyMinutes: 90 });
    expect(second.weeklyMinutes).toBe(300);

    const third = await service.setGoal({
      dailyMinutes: 90,
      weeklyMinutes: null,
    });
    expect(third.weeklyMinutes).toBeNull();
  });

  it("reports days, hits, streaks, and weekly progress", async () => {
    await service.setGoal({ dailyMinutes: 60, weeklyMinutes: 300 });
    store.seed(
      [
        session({
          id: "fri",
          start: "2026-10-30T09:00:00+05:30",
          minutes: 90,
        }),
        session({
          id: "sat",
          start: "2026-10-31T09:00:00+05:30",
          minutes: 30,
        }),
        session({
          id: "sun",
          start: "2026-11-01T09:00:00+05:30",
          minutes: 75,
        }),
      ],
      null,
      store.goal(),
    );

    const progress = await service.goalProgress(
      new Date("2026-10-30T00:00:00+05:30"),
      new Date("2026-11-01T23:59:59.999+05:30"),
    );

    expect(progress.days).toHaveLength(3);
    expect(progress.daysHit).toEqual(["2026-10-30", "2026-11-01"]);
    expect(progress.currentStreak).toBe(1);
    expect(progress.longestStreak).toBe(1);
    expect(progress.todayMet).toBe(true);
    expect(progress.todayPending).toBe(false);
    expect(progress.weeks).toHaveLength(1);
    expect(progress.weeks[0]).toMatchObject({
      weekStart: "2026-10-26",
      activeMinutes: 195,
      targetMinutes: 300,
      met: false,
      partial: true,
    });
  });

  it("counts a session ending exactly at midnight as the full target", async () => {
    await service.setGoal({ dailyMinutes: 60 });
    store.seed(
      [
        {
          id: "until-midnight",
          start: new Date("2026-10-31T23:00:00+05:30"),
          end: new Date("2026-11-01T00:00:00+05:30"),
          pausedSeconds: 0,
          pausedAt: null,
          label: "Until midnight",
          tag: null,
          pauseIntervals: [],
        },
      ],
      null,
      store.goal(),
    );

    const progress = await service.goalProgress(
      new Date("2026-10-31T00:00:00+05:30"),
      new Date("2026-10-31T23:59:59.999+05:30"),
    );

    expect(progress.days[0]).toMatchObject({
      date: "2026-10-31",
      activeMinutes: 60,
      met: true,
    });
  });

  it("splits a cross-midnight session across goal days", async () => {
    await service.setGoal({ dailyMinutes: 60 });
    store.seed(
      [
        {
          id: "overnight",
          start: new Date("2026-10-31T23:00:00+05:30"),
          end: new Date("2026-11-01T01:00:00+05:30"),
          pausedSeconds: 0,
          pausedAt: null,
          label: "Overnight",
          tag: null,
          pauseIntervals: [],
        },
      ],
      null,
      store.goal(),
    );

    const progress = await service.goalProgress(
      new Date("2026-10-31T00:00:00+05:30"),
      new Date("2026-11-01T23:59:59.999+05:30"),
    );

    expect(progress.days).toMatchObject([
      { date: "2026-10-31", activeMinutes: 60, met: true },
      { date: "2026-11-01", activeMinutes: 60, met: true },
    ]);
    expect(progress.daysHit).toEqual(["2026-10-31", "2026-11-01"]);
    expect(progress.currentStreak).toBe(2);
    expect(progress.longestStreak).toBe(2);
    expect(progress.weeks[0]?.activeMinutes).toBe(120);
  });

  it("keeps the current streak alive through yesterday when today is pending", async () => {
    await service.setGoal({ dailyMinutes: 60 });
    store.seed(
      [
        session({
          id: "fri",
          start: "2026-10-30T09:00:00+05:30",
          minutes: 90,
        }),
        session({
          id: "sat",
          start: "2026-10-31T09:00:00+05:30",
          minutes: 90,
        }),
        session({
          id: "sun",
          start: "2026-11-01T09:00:00+05:30",
          minutes: 30,
        }),
      ],
      null,
      store.goal(),
    );

    const progress = await service.goalProgress(
      new Date("2026-10-30T00:00:00+05:30"),
      new Date("2026-11-01T23:59:59.999+05:30"),
    );

    expect(progress.todayMet).toBe(false);
    expect(progress.todayPending).toBe(true);
    expect(progress.currentStreak).toBe(2);
    expect(progress.longestStreak).toBe(2);
  });

  it("reports active days without a goal instead of failing", async () => {
    store.seed(
      [
        session({
          id: "sun",
          start: "2026-11-01T09:00:00+05:30",
          minutes: 45,
        }),
      ],
      null,
      null,
    );

    const progress = await service.goalProgress(
      new Date("2026-11-01T00:00:00+05:30"),
      new Date("2026-11-01T23:59:59.999+05:30"),
    );

    expect(progress.goal).toBeNull();
    expect(progress.days[0]).toMatchObject({
      date: "2026-11-01",
      activeMinutes: 45,
      targetMinutes: null,
      met: null,
    });
    expect(progress.currentStreak).toBe(0);
    expect(progress.longestStreak).toBe(0);
  });
});
