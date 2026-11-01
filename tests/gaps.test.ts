import { describe, expect, it } from "vitest";
import { buildGapAnalysis } from "@/lib/gaps";
import type { SessionRecord } from "@/lib/session-types";

const NOW = new Date("2026-11-02T12:00:00+05:30");

function session({
  id,
  start,
  end,
  pausedSeconds = 0,
  pauseIntervals = [],
}: {
  id: string;
  start: string;
  end: string;
  pausedSeconds?: number;
  pauseIntervals?: { start: string; end: string }[];
}): SessionRecord {
  return {
    id,
    start: new Date(start),
    end: new Date(end),
    pausedSeconds,
    pausedAt: null,
    label: id,
    tag: null,
    pauseIntervals: pauseIntervals.map((interval) => ({
      start: new Date(interval.start),
      end: new Date(interval.end),
    })),
  };
}

describe("gap analysis", () => {
  it("returns gaps, day spans, medians, and pause counts", () => {
    const analysis = buildGapAnalysis(
      [
        session({
          id: "a",
          start: "2026-10-31T09:00:00+05:30",
          end: "2026-10-31T10:00:00+05:30",
        }),
        session({
          id: "b",
          start: "2026-10-31T10:30:00+05:30",
          end: "2026-10-31T11:00:00+05:30",
          pausedSeconds: 300,
          pauseIntervals: [
            {
              start: "2026-10-31T10:30:00+05:30",
              end: "2026-10-31T10:35:00+05:30",
            },
          ],
        }),
        session({
          id: "c",
          start: "2026-10-31T14:00:00+05:30",
          end: "2026-10-31T15:00:00+05:30",
        }),
        session({
          id: "d",
          start: "2026-11-01T09:00:00+05:30",
          end: "2026-11-01T09:30:00+05:30",
        }),
      ],
      new Date("2026-10-31T00:00:00+05:30"),
      new Date("2026-11-01T23:59:59.999+05:30"),
      NOW,
      5,
      false,
    );

    expect(analysis.gaps.map((gap) => gap.gapMinutes)).toEqual([
      30, 180, 1080,
    ]);
    expect(analysis.gaps[0]).toMatchObject({
      afterSessionId: "a",
      beforeSessionId: "b",
      sameDay: true,
    });
    expect(analysis.gaps[2].sameDay).toBe(false);
    expect(analysis.medianBreakMinutes).toBe(105);
    expect(analysis.medianAllGapMinutes).toBe(180);
    expect(analysis.overnightGapCount).toBe(1);
    expect(analysis.pausedSessionCount).toBe(1);
    expect(analysis.pauseEventCount).toBe(1);
    expect(analysis.totalPausedMinutes).toBe(5);
    expect(analysis.daySpans).toHaveLength(2);
    expect(analysis.daySpans[0]).toMatchObject({
      date: "2026-10-31",
      spanMinutes: 360,
      activeMinutes: 145,
      sessionCount: 3,
    });
    expect(analysis.daySpans[0].focusRatio).toBeCloseTo(0.4028, 3);
  });

  it("reports overlaps and filters short gaps", () => {
    const analysis = buildGapAnalysis(
      [
        session({
          id: "a",
          start: "2026-10-31T09:00:00+05:30",
          end: "2026-10-31T10:00:00+05:30",
        }),
        session({
          id: "b",
          start: "2026-10-31T09:30:00+05:30",
          end: "2026-10-31T10:30:00+05:30",
        }),
        session({
          id: "c",
          start: "2026-10-31T10:32:00+05:30",
          end: "2026-10-31T11:00:00+05:30",
        }),
      ],
      new Date("2026-10-31T00:00:00+05:30"),
      new Date("2026-10-31T23:59:59.999+05:30"),
      NOW,
      5,
      false,
    );

    expect(analysis.overlaps).toEqual([
      {
        afterSessionId: "a",
        beforeSessionId: "b",
        overlapMinutes: 30,
      },
    ]);
    expect(analysis.gaps).toHaveLength(0);
  });
});
