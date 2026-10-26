import { describe, expect, it } from "vitest";
import { formatHoursMinutes } from "@/lib/ui-format";

describe("chart time labels", () => {
  it("formats hours and minutes as zero-padded HH:MM", () => {
    expect(formatHoursMinutes(62 * 60)).toBe("01:02");
    expect(formatHoursMinutes((3 * 60 + 20) * 60)).toBe("03:20");
    expect(formatHoursMinutes(42 * 60)).toBe("00:42");
    expect(formatHoursMinutes(0)).toBe("00:00");
  });

  it("floors partial minutes", () => {
    expect(formatHoursMinutes(61 * 60 + 59)).toBe("01:01");
  });
});
