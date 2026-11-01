import { describe, expect, it } from "vitest";
import { buildHourlySummary } from "@/lib/hourly";
import type { SessionRecord } from "@/lib/session-types";

function session(overrides: Partial<SessionRecord>): SessionRecord {
  return {
    id: "session",
    start: new Date("2026-10-31T09:00:00+05:30"),
    end: new Date("2026-10-31T10:00:00+05:30"),
    pausedSeconds: 0,
    pausedAt: null,
    label: "Session",
    tag: null,
    pauseIntervals: [],
    ...overrides,
  };
}

const FROM = new Date("2026-10-31T00:00:00+05:30");
const TO = new Date("2026-11-01T23:59:59.999+05:30");
const NOW = new Date("2026-11-02T12:00:00+05:30");

describe("hourly summary", () => {
  it("splits a session across midnight and hour boundaries", () => {
    const summary = buildHourlySummary(
      [
        session({
          id: "night",
          start: new Date("2026-10-31T23:30:00+05:30"),
          end: new Date("2026-11-01T01:00:00+05:30"),
        }),
      ],
      FROM,
      TO,
      NOW,
      true,
      false,
    );

    expect(summary.hours[23].activeMinutes).toBe(30);
    expect(summary.hours[0].activeMinutes).toBe(60);
    expect(summary.totalActiveMinutes).toBe(90);
    expect(summary.sessionCount).toBe(1);

    const saturday = summary.weekdayBreakdown?.find(
      (row) => row.name === "Sat",
    );
    const sunday = summary.weekdayBreakdown?.find(
      (row) => row.name === "Sun",
    );
    expect(saturday?.hours[23].activeMinutes).toBe(30);
    expect(sunday?.hours[0].activeMinutes).toBe(60);
  });

  it("subtracts recorded pause intervals exactly", () => {
    const summary = buildHourlySummary(
      [
        session({
          id: "paused",
          start: new Date("2026-10-31T09:00:00+05:30"),
          end: new Date("2026-10-31T11:00:00+05:30"),
          pausedSeconds: 45 * 60,
          pauseIntervals: [
            {
              start: new Date("2026-10-31T09:30:00+05:30"),
              end: new Date("2026-10-31T10:00:00+05:30"),
            },
            {
              start: new Date("2026-10-31T10:30:00+05:30"),
              end: new Date("2026-10-31T10:45:00+05:30"),
            },
          ],
        }),
      ],
      FROM,
      TO,
      NOW,
      false,
      false,
    );

    expect(summary.hours[9].activeMinutes).toBe(30);
    expect(summary.hours[10].activeMinutes).toBe(45);
    expect(summary.totalActiveMinutes).toBe(75);
  });

  it("falls back for older paused sessions without intervals", () => {
    const summary = buildHourlySummary(
      [
        session({
          id: "legacy",
          start: new Date("2026-10-31T09:00:00+05:30"),
          end: new Date("2026-10-31T11:00:00+05:30"),
          pausedSeconds: 45 * 60,
        }),
      ],
      FROM,
      TO,
      NOW,
      false,
      false,
    );

    expect(summary.hours[9].activeMinutes).toBe(37.5);
    expect(summary.hours[10].activeMinutes).toBe(37.5);
    expect(summary.totalActiveMinutes).toBe(75);
  });

  it("clips a running session at the current instant", () => {
    const summary = buildHourlySummary(
      [
        session({
          id: "running",
          start: new Date("2026-10-31T09:30:00+05:30"),
          end: null,
        }),
      ],
      FROM,
      TO,
      new Date("2026-10-31T10:15:00+05:30"),
      false,
      false,
    );

    expect(summary.hours[9].activeMinutes).toBe(30);
    expect(summary.hours[10].activeMinutes).toBe(15);
    expect(summary.totalActiveMinutes).toBe(45);
  });
});
