import { describe, expect, it } from "vitest";
import {
  InvalidDateRangeError,
  formatIstDayMonth,
  formatIstHeaderDate,
  formatIstIso,
  formatIstTime,
  istDateKey,
  parseIstInstant,
  parseIstRange,
} from "@/lib/ist-dates";

describe("IST dates", () => {
  it("formats a UTC timestamp as IST", () => {
    const date = new Date("2026-10-25T09:05:00.000Z");
    expect(formatIstTime(date)).toBe("14:35");
    expect(formatIstIso(date)).toBe("2026-10-25T14:35:00.000+05:30");
    expect(istDateKey(date)).toBe("2026-10-25");
  });

  it("groups a late UTC timestamp onto the next IST day", () => {
    const date = new Date("2026-10-24T20:00:00.000Z");
    expect(istDateKey(date)).toBe("2026-10-25");
  });

  it("formats compact labels for the header and chart axes", () => {
    const date = new Date("2026-09-07T06:30:00.000Z");
    expect(formatIstHeaderDate(date)).toBe("Mon 07 Sep 2026");
    expect(formatIstDayMonth(date)).toBe("7 Sep");
  });

  it("treats date-only ranges as inclusive IST days", () => {
    const range = parseIstRange("2026-10-01", "2026-10-01");

    expect(range.from.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-01T18:29:59.999Z");
  });

  it("interprets offset-less datetimes in IST", () => {
    const range = parseIstRange(
      "2026-10-01T09:30:00",
      "2026-10-01T10:00:00",
    );

    expect(range.from.toISOString()).toBe("2026-10-01T04:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-01T04:30:00.000Z");
  });

  it("honors explicit UTC offsets", () => {
    const range = parseIstRange(
      "2026-10-01T00:00:00Z",
      "2026-10-01T12:00:00Z",
    );

    expect(range.from.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });

  it("parses single instants for edits", () => {
    expect(
      parseIstInstant("2026-10-01", "start").toISOString(),
    ).toBe("2026-09-30T18:30:00.000Z");
    expect(
      parseIstInstant("2026-10-01", "end").toISOString(),
    ).toBe("2026-10-01T18:29:59.999Z");
    expect(
      parseIstInstant("2026-10-01T09:30:00", "start").toISOString(),
    ).toBe("2026-10-01T04:00:00.000Z");
  });

  it("rejects reversed ranges and impossible dates", () => {
    expect(() =>
      parseIstRange("2026-10-02", "2026-10-01"),
    ).toThrow(InvalidDateRangeError);

    expect(() =>
      parseIstRange("2026-02-31", "2026-03-01"),
    ).toThrow(InvalidDateRangeError);

    expect(() =>
      parseIstRange("2026-10-01T25:00:00", "2026-10-02"),
    ).toThrow(InvalidDateRangeError);
  });

  it("requires a date range string", () => {
    expect(() => parseIstRange("", "2026-10-01")).toThrow(
      InvalidDateRangeError,
    );
  });
});
