import { beforeEach, describe, expect, it } from "vitest";
import { parseIstRange } from "@/lib/ist-dates";
import { createSessionService, type SessionService } from "@/lib/session-service";
import type { SessionRecord } from "@/lib/session-types";
import { canonicalTagDisplays, tagKey } from "@/lib/tags";
import { buildTagTotals } from "@/lib/analysis";
import { MemorySessionStore } from "./helpers/memory-store";

const NOW = new Date("2026-11-01T09:00:00.000Z");

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
  };
}

describe("case-insensitive tags", () => {
  let store: MemorySessionStore;
  let service: SessionService;

  beforeEach(() => {
    store = new MemorySessionStore();
    service = createSessionService(store, { now: () => NOW });
  });

  it("normalizes comparison keys and picks the latest spelling", () => {
    expect(tagKey("  DSA  ")).toBe("dsa");
    expect(tagKey("")).toBeNull();

    const displays = canonicalTagDisplays([
      session({
        id: "old",
        start: "2026-10-30T09:00:00+05:30",
        minutes: 10,
        tag: "dsa",
      }),
      session({
        id: "new",
        start: "2026-10-31T09:00:00+05:30",
        minutes: 20,
        tag: "DSA",
      }),
    ]);

    expect(displays.get("dsa")).toBe("DSA");
  });

  it("filters sessions by tag without caring about case", async () => {
    store.seed([
      session({
        id: "lower",
        start: "2026-10-30T09:00:00+05:30",
        minutes: 10,
        tag: "dsa",
      }),
      session({
        id: "upper",
        start: "2026-10-31T09:00:00+05:30",
        minutes: 20,
        tag: "DSA",
      }),
      session({
        id: "other",
        start: "2026-10-31T10:00:00+05:30",
        minutes: 5,
        tag: "FOLW",
      }),
    ]);

    const range = parseIstRange("2026-10-30", "2026-10-31");
    const filtered = await service.listSessions({ ...range, tag: "DsA" });

    expect(filtered.map((item) => item.id)).toEqual(["upper", "lower"]);
  });

  it("merges case variants in summary and analysis totals", async () => {
    store.seed([
      session({
        id: "lower",
        start: "2026-10-30T09:00:00+05:30",
        minutes: 10,
        tag: "dsa",
      }),
      session({
        id: "upper",
        start: "2026-10-31T09:00:00+05:30",
        minutes: 20,
        tag: "DSA",
      }),
    ]);

    const range = parseIstRange("2026-10-30", "2026-10-31");
    const summary = await service.summarize(range.from, range.to);

    expect(summary.activeMinutesByTag).toEqual({ DSA: 30 });

    const analysis = buildTagTotals(store.sessions(), new Date("2026-11-01T00:00:00+05:30"));
    expect(analysis).toEqual([
      { tag: "DSA", activeSeconds: 1800, sessionCount: 2 },
    ]);
  });

  it("lists merged tags with variants and untagged counts", async () => {
    store.seed([
      session({
        id: "lower",
        start: "2026-10-30T09:00:00+05:30",
        minutes: 10,
        tag: "dsa",
      }),
      session({
        id: "upper",
        start: "2026-10-31T09:00:00+05:30",
        minutes: 20,
        tag: "DSA",
      }),
      session({
        id: "untagged",
        start: "2026-10-31T10:00:00+05:30",
        minutes: 5,
        tag: null,
      }),
    ]);

    const result = await service.listTags();

    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]).toMatchObject({
      tag: "DSA",
      tagKey: "dsa",
      sessionCount: 2,
      activeMinutes: 30,
      lastSessionId: "upper",
    });
    expect(result.tags[0].variants).toEqual([
      { tag: "dsa", sessionCount: 1 },
      { tag: "DSA", sessionCount: 1 },
    ]);
    expect(result.untaggedSessionCount).toBe(1);
  });
});
