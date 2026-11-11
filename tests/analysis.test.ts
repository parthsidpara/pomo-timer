import { describe, expect, it } from "vitest";
import {
  ANALYSIS_DAYS,
  ANALYSIS_WEEKS,
  analysisWindowStart,
  buildAnalysisData,
  buildAnalysisSummary,
  buildDailyBuckets,
  buildTagTotals,
  buildTodaySessions,
  buildWeeklyBuckets,
  istWeekStartKey,
} from "@/lib/analysis";
import type { SessionRecord } from "@/lib/session-types";

// Monday 26 October 2026, 12:00 IST.
const NOW = new Date("2026-10-26T06:30:00.000Z");

function session({
  id,
  start,
  end = null,
  pausedSeconds = 0,
  tag = null,
}: {
  id: string;
  start: string;
  end?: string | null;
  pausedSeconds?: number;
  tag?: string | null;
}): SessionRecord {
  return {
    id,
    start: new Date(start),
    end: end ? new Date(end) : null,
    pausedSeconds,
    pausedAt: null,
    label: id,
    tag,
  };
}

describe("analysis", () => {
  it("uses the last 7 IST days including today", () => {
    const sessions = [
      session({
        id: "today",
        start: "2026-10-26T09:00:00+05:30",
        end: "2026-10-26T10:00:00+05:30",
        pausedSeconds: 600,
        tag: "alpha",
      }),
      session({
        id: "yesterday",
        start: "2026-10-25T09:00:00+05:30",
        end: "2026-10-25T09:30:00+05:30",
        tag: null,
      }),
      session({
        id: "edge",
        start: "2026-10-20T09:00:00+05:30",
        end: "2026-10-20T10:00:00+05:30",
        tag: "alpha",
      }),
      session({
        id: "outside",
        start: "2026-10-19T09:00:00+05:30",
        end: "2026-10-19T10:00:00+05:30",
      }),
      session({
        id: "running",
        start: "2026-10-26T11:00:00+05:30",
      }),
    ];

    const daily = buildDailyBuckets(sessions, NOW);

    expect(ANALYSIS_DAYS).toBe(7);
    expect(daily).toHaveLength(7);
    expect(daily[0].key).toBe("2026-10-20");
    expect(daily[6].key).toBe("2026-10-26");
    expect(daily.map((bucket) => bucket.activeSeconds)).toEqual([
      3600, 0, 0, 0, 0, 1800, 3000,
    ]);
    expect(daily.reduce((sum, bucket) => sum + bucket.sessionCount, 0)).toBe(
      3,
    );
  });

  it("splits a session across midnight in daily and weekly buckets", () => {
    const sessions = [
      session({
        id: "overnight",
        start: "2026-10-25T23:00:00+05:30",
        end: "2026-10-26T01:00:00+05:30",
      }),
    ];

    const daily = buildDailyBuckets(sessions, NOW);
    const weekly = buildWeeklyBuckets(sessions, NOW);

    expect(daily.find((bucket) => bucket.key === "2026-10-25")).toMatchObject({
      activeSeconds: 3600,
      sessionCount: 1,
    });
    expect(daily.find((bucket) => bucket.key === "2026-10-26")).toMatchObject({
      activeSeconds: 3600,
      sessionCount: 1,
    });
    expect(weekly.find((bucket) => bucket.key === "2026-10-19")).toMatchObject({
      activeSeconds: 3600,
      sessionCount: 1,
    });
    expect(weekly.find((bucket) => bucket.key === "2026-10-26")).toMatchObject({
      activeSeconds: 3600,
      sessionCount: 1,
    });
  });

  it("groups weeks Monday through Sunday in IST", () => {
    const sessions = [
      session({
        id: "monday-this-week",
        start: "2026-10-26T09:00:00+05:30",
        end: "2026-10-26T10:00:00+05:30",
      }),
      session({
        id: "sunday-last-week",
        start: "2026-10-25T09:00:00+05:30",
        end: "2026-10-25T09:30:00+05:30",
      }),
      session({
        id: "first-in-window",
        start: "2026-09-07T10:00:00+05:30",
        end: "2026-09-07T10:45:00+05:30",
      }),
      session({
        id: "before-window",
        start: "2026-09-06T10:00:00+05:30",
        end: "2026-09-06T11:00:00+05:30",
      }),
    ];

    const weekly = buildWeeklyBuckets(sessions, NOW);

    expect(istWeekStartKey(new Date("2026-10-25T09:00:00+05:30"))).toBe(
      "2026-10-19",
    );
    expect(ANALYSIS_WEEKS).toBe(8);
    expect(weekly).toHaveLength(8);
    expect(weekly[0].key).toBe("2026-09-07");
    expect(weekly[7].key).toBe("2026-10-26");
    expect(weekly[0].activeSeconds).toBe(2700);
    expect(weekly[6].activeSeconds).toBe(1800);
    expect(weekly[7].activeSeconds).toBe(3600);
  });

  it("computes the analysis window start from the current IST week", () => {
    expect(analysisWindowStart(NOW).toISOString()).toBe(
      "2026-09-06T18:30:00.000Z",
    );
  });

  it("summarizes completed sessions only", () => {
    const sessions = [
      session({
        id: "one",
        start: "2026-10-20T09:00:00+05:30",
        end: "2026-10-20T10:00:00+05:30",
      }),
      session({
        id: "two",
        start: "2026-10-21T09:00:00+05:30",
        end: "2026-10-21T09:30:00+05:30",
      }),
      session({
        id: "three",
        start: "2026-10-22T09:00:00+05:30",
        end: "2026-10-22T09:45:00+05:30",
      }),
      session({
        id: "running",
        start: "2026-10-26T11:00:00+05:30",
      }),
      session({
        id: "outside",
        start: "2026-09-01T09:00:00+05:30",
        end: "2026-09-01T10:00:00+05:30",
      }),
    ];

    const summary = buildAnalysisSummary(sessions, NOW);

    expect(summary.completedSessionCount).toBe(3);
    expect(summary.totalActiveSeconds).toBe(8100);
    expect(summary.averageActiveSeconds).toBe(2700);
    expect(summary.longestActiveSeconds).toBe(3600);
  });

  it("builds tag totals in descending active time order", () => {
    const sessions = [
      session({
        id: "alpha-one",
        start: "2026-10-20T09:00:00+05:30",
        end: "2026-10-20T10:00:00+05:30",
        tag: "alpha",
      }),
      session({
        id: "untagged",
        start: "2026-10-21T09:00:00+05:30",
        end: "2026-10-21T09:30:00+05:30",
      }),
      session({
        id: "alpha-two",
        start: "2026-10-22T09:00:00+05:30",
        end: "2026-10-22T09:45:00+05:30",
        tag: "alpha",
      }),
      session({
        id: "outside",
        start: "2026-09-01T09:00:00+05:30",
        end: "2026-09-01T10:00:00+05:30",
        tag: "outside",
      }),
    ];

    const tags = buildTagTotals(sessions, NOW);

    expect(tags).toEqual([
      { tag: "alpha", activeSeconds: 6300, sessionCount: 2 },
      { tag: "(untagged)", activeSeconds: 1800, sessionCount: 1 },
    ]);
  });

  it("lists completed sessions started today, newest first", () => {
    const sessions = [
      session({
        id: "morning",
        start: "2026-10-26T09:00:00+05:30",
        end: "2026-10-26T10:00:00+05:30",
      }),
      session({
        id: "late-morning",
        start: "2026-10-26T11:00:00+05:30",
        end: "2026-10-26T11:30:00+05:30",
      }),
      session({
        id: "midnight",
        start: "2026-10-26T00:10:00+05:30",
        end: "2026-10-26T00:20:00+05:30",
      }),
      session({
        id: "running",
        start: "2026-10-26T11:35:00+05:30",
      }),
      session({
        id: "yesterday",
        start: "2026-10-25T09:00:00+05:30",
        end: "2026-10-25T10:00:00+05:30",
      }),
    ];

    const today = buildTodaySessions(sessions, NOW);

    expect(today.map((item) => item.id)).toEqual([
      "late-morning",
      "morning",
      "midnight",
    ]);
  });

  it("builds all analysis sections from the same session set", () => {
    const analysis = buildAnalysisData([], NOW);

    expect(analysis.daily).toHaveLength(7);
    expect(analysis.weekly).toHaveLength(8);
    expect(analysis.today).toEqual([]);
    expect(analysis.summary).toEqual({
      totalActiveSeconds: 0,
      completedSessionCount: 0,
      averageActiveSeconds: null,
      longestActiveSeconds: null,
    });
    expect(analysis.tags).toEqual([]);
  });
});
