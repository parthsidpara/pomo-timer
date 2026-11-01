import { beforeEach, describe, expect, it } from "vitest";
import { activeSeconds } from "@/lib/active-time";
import { createSessionService, type SessionService } from "@/lib/session-service";
import type { SessionRecord } from "@/lib/session-types";
import { MemorySessionStore } from "./helpers/memory-store";

function makeSession(
  overrides: Partial<SessionRecord> & Pick<SessionRecord, "id" | "start">,
): SessionRecord {
  return {
    end: null,
    pausedSeconds: 0,
    pausedAt: null,
    label: overrides.id,
    tag: null,
    pauseIntervals: [],
    ...overrides,
  };
}

describe("session editing and deletion", () => {
  let store: MemorySessionStore;
  let service: SessionService;
  let clock: { value: Date };

  beforeEach(() => {
    store = new MemorySessionStore();
    clock = { value: new Date("2026-10-31T09:00:00+05:30") };
    service = createSessionService(store, {
      now: () => new Date(clock.value),
      createId: () => "generated-id",
    });
  });

  it("updates label and tag on a completed session", async () => {
    store.seed([
      makeSession({
        id: "one",
        start: new Date("2026-10-30T09:00:00+05:30"),
        end: new Date("2026-10-30T10:00:00+05:30"),
        tag: "old",
      }),
    ]);

    const result = await service.updateSession({
      id: "one",
      label: "  New label  ",
      tag: "  DSA  ",
    });

    expect(result.session.label).toBe("New label");
    expect(result.session.tag).toBe("DSA");
    expect(result.adjustedPausedSeconds).toBe(false);
    expect(store.sessions()[0]).toMatchObject({
      label: "New label",
      tag: "DSA",
    });
  });

  it("clears label and tag with null", async () => {
    store.seed([
      makeSession({
        id: "one",
        start: new Date("2026-10-30T09:00:00+05:30"),
        end: new Date("2026-10-30T10:00:00+05:30"),
        label: "Named",
        tag: "dsa",
      }),
    ]);

    const result = await service.updateSession({
      id: "one",
      label: null,
      tag: null,
    });

    expect(result.session.label).toBe("");
    expect(result.session.tag).toBeNull();
  });

  it("trims an active session and clears the active pointer", async () => {
    const started = await service.startSession({ label: "Long timer" });
    clock.value = new Date(started.start.getTime() + 60 * 60_000);
    const trimmedEnd = new Date(started.start.getTime() + 30 * 60_000);

    const result = await service.updateSession({
      id: started.id,
      end: trimmedEnd,
    });

    expect(result.session.end).toEqual(trimmedEnd);
    expect(activeSeconds(result.session)).toBe(30 * 60);
    expect(store.activeSessionId()).toBeNull();
    await expect(service.currentSession()).resolves.toBeNull();
  });

  it("commits the current pause when an active paused session is trimmed", async () => {
    const started = await service.startSession({ label: "Paused timer" });
    clock.value = new Date(started.start.getTime() + 20 * 60_000);
    await service.pauseSession();
    clock.value = new Date(started.start.getTime() + 50 * 60_000);

    const result = await service.updateSession({
      id: started.id,
      end: new Date(started.start.getTime() + 30 * 60_000),
    });

    expect(result.session.pausedAt).toBeNull();
    expect(result.session.pausedSeconds).toBe(10 * 60);
    expect(activeSeconds(result.session)).toBe(20 * 60);
    expect(store.activeSessionId()).toBeNull();
  });

  it("deletes an active session and clears the pointer", async () => {
    const started = await service.startSession({ label: "Accidental" });

    const result = await service.deleteSession(started.id);

    expect(result.wasActive).toBe(true);
    expect(result.session.id).toBe(started.id);
    expect(store.sessions()).toHaveLength(0);
    expect(store.activeSessionId()).toBeNull();
  });

  it("reports not_found for unknown sessions", async () => {
    await expect(service.deleteSession("missing")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      service.updateSession({ id: "missing", label: "x" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects empty edits and impossible dates", async () => {
    store.seed([
      makeSession({
        id: "one",
        start: new Date("2026-10-30T09:00:00+05:30"),
        end: new Date("2026-10-30T10:00:00+05:30"),
      }),
    ]);

    await expect(service.updateSession({ id: "one" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      service.updateSession({
        id: "one",
        start: new Date("2026-10-30T11:00:00+05:30"),
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      service.updateSession({
        id: "one",
        end: new Date("2026-10-30T08:00:00+05:30"),
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("clamps paused time when an edit makes it longer than the session", async () => {
    store.seed([
      makeSession({
        id: "one",
        start: new Date("2026-10-30T09:00:00+05:30"),
        end: new Date("2026-10-30T10:00:00+05:30"),
        pausedSeconds: 60 * 60,
      }),
    ]);

    const result = await service.updateSession({
      id: "one",
      end: new Date("2026-10-30T09:30:00+05:30"),
    });

    expect(result.adjustedPausedSeconds).toBe(true);
    expect(result.session.pausedSeconds).toBe(30 * 60);
    expect(activeSeconds(result.session)).toBe(0);
  });

  it("recomputes active time and clips pause intervals when start or end changes", async () => {
    store.seed([
      makeSession({
        id: "one",
        start: new Date("2026-10-30T09:00:00+05:30"),
        end: new Date("2026-10-30T10:00:00+05:30"),
        pausedSeconds: 15 * 60,
        pauseIntervals: [
          {
            start: new Date("2026-10-30T09:30:00+05:30"),
            end: new Date("2026-10-30T09:45:00+05:30"),
          },
        ],
      }),
    ]);

    const result = await service.updateSession({
      id: "one",
      end: new Date("2026-10-30T09:40:00+05:30"),
    });

    expect(result.session.pausedSeconds).toBe(10 * 60);
    expect(result.session.pauseIntervals).toHaveLength(1);
    expect(result.session.pauseIntervals?.[0].end.toISOString()).toBe(
      "2026-10-30T04:10:00.000Z",
    );
    expect(activeSeconds(result.session)).toBe(30 * 60);
    expect(result.adjustedPausedSeconds).toBe(true);
  });

  it("retags only untagged sessions by default, then everything", async () => {
    store.seed([
      makeSession({
        id: "untagged",
        start: new Date("2026-10-30T09:00:00+05:30"),
        end: new Date("2026-10-30T10:00:00+05:30"),
      }),
      makeSession({
        id: "tagged",
        start: new Date("2026-10-30T11:00:00+05:30"),
        end: new Date("2026-10-30T12:00:00+05:30"),
        tag: "old",
      }),
    ]);

    const first = await service.retagSessions({
      from: new Date("2026-10-30T00:00:00+05:30"),
      to: new Date("2026-10-30T23:59:59.999+05:30"),
      tag: "DSA",
      onlyUntagged: true,
    });

    expect(first.updatedCount).toBe(1);
    expect(first.sessionIds).toEqual(["untagged"]);

    const second = await service.retagSessions({
      from: new Date("2026-10-30T00:00:00+05:30"),
      to: new Date("2026-10-30T23:59:59.999+05:30"),
      tag: "DSA",
      onlyUntagged: false,
    });

    expect(second.updatedCount).toBe(1);
    expect(store.sessions().map((session) => session.tag)).toEqual([
      "DSA",
      "DSA",
    ]);
  });
});
