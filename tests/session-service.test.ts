import { beforeEach, describe, expect, it } from "vitest";
import { activeSeconds } from "@/lib/active-time";
import { parseIstRange } from "@/lib/ist-dates";
import {
  createSessionService,
  type SessionService,
} from "@/lib/session-service";
import type { SessionRecord } from "@/lib/session-types";
import { MemorySessionStore } from "./helpers/memory-store";

const INITIAL_TIME = new Date("2026-10-25T04:00:00.000Z");

function advance(clock: { value: Date }, seconds: number): void {
  clock.value = new Date(clock.value.getTime() + seconds * 1000);
}

function makeSession(
  overrides: Partial<SessionRecord> & Pick<SessionRecord, "id" | "start">,
): SessionRecord {
  return {
    end: null,
    pausedSeconds: 0,
    pausedAt: null,
    label: "Session",
    tag: null,
    ...overrides,
  };
}

describe("shared session service", () => {
  let store: MemorySessionStore;
  let service: SessionService;
  let clock: { value: Date };
  let sequence: number;

  beforeEach(() => {
    store = new MemorySessionStore();
    clock = { value: INITIAL_TIME };
    sequence = 0;
    service = createSessionService(store, {
      now: () => new Date(clock.value),
      createId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    });
  });

  it("starts a session, trims input, and records the active pointer", async () => {
    const session = await service.startSession({
      label: "  Build the MCP server  ",
      tag: "  worklog  ",
    });

    expect(session.label).toBe("Build the MCP server");
    expect(session.tag).toBe("worklog");
    expect(session.start).toEqual(INITIAL_TIME);
    expect(session.end).toBeNull();
    expect(session.pausedSeconds).toBe(0);
    expect(store.activeSessionId()).toBe(session.id);
    await expect(service.currentSession()).resolves.toMatchObject({
      id: session.id,
    });
  });

  it("refuses a second start while a session is running", async () => {
    const first = await service.startSession({ label: "First" });

    await expect(
      service.startSession({ label: "Second" }),
    ).rejects.toMatchObject({
      name: "SessionError",
      code: "already_running",
      message: expect.stringContaining("First"),
    });

    expect(store.sessions()).toHaveLength(1);
    expect(store.activeSessionId()).toBe(first.id);
  });

  it("allows only one winner when two starts race", async () => {
    const results = await Promise.allSettled([
      service.startSession({ label: "One" }),
      service.startSession({ label: "Two" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(store.sessions()).toHaveLength(1);
  });

  it("pauses, resumes, and stops with the correct active time", async () => {
    const started = await service.startSession({ label: "Deep work" });

    advance(clock, 10 * 60);
    const paused = await service.pauseSession();
    expect(paused.pausedAt).toEqual(clock.value);
    expect(activeSeconds(paused, clock.value)).toBe(600);

    advance(clock, 2 * 60);
    const afterPause = await service.currentSession();
    expect(afterPause).not.toBeNull();
    expect(activeSeconds(afterPause!, clock.value)).toBe(600);

    const resumed = await service.resumeSession();
    expect(resumed.pausedAt).toBeNull();
    expect(resumed.pausedSeconds).toBe(120);

    advance(clock, 3 * 60);
    const stopped = await service.stopSession();

    expect(stopped.id).toBe(started.id);
    expect(stopped.end).toEqual(clock.value);
    expect(stopped.pausedAt).toBeNull();
    expect(stopped.pausedSeconds).toBe(120);
    expect(activeSeconds(stopped, new Date("2030-01-01T00:00:00Z"))).toBe(13 * 60);
    expect(store.activeSessionId()).toBeNull();
    await expect(service.currentSession()).resolves.toBeNull();

    const next = await service.startSession({ label: "Next session" });
    expect(next.id).not.toBe(started.id);
  });

  it("includes the final pause when stopped while paused", async () => {
    await service.startSession({ label: "Paused finish" });
    advance(clock, 5 * 60);
    await service.pauseSession();
    advance(clock, 60);
    const stopped = await service.stopSession();

    expect(stopped.pausedSeconds).toBe(60);
    expect(activeSeconds(stopped)).toBe(300);
    expect(stopped.end).toEqual(clock.value);
    expect(stopped.pausedAt).toBeNull();
  });

  it("reports clear errors for invalid pause and resume actions", async () => {
    await expect(service.pauseSession()).rejects.toMatchObject({
      code: "no_active",
    });
    await expect(service.resumeSession()).rejects.toMatchObject({
      code: "no_active",
    });
    await expect(service.stopSession()).rejects.toMatchObject({
      code: "no_active",
    });

    await service.startSession({ label: "Running" });
    await expect(service.resumeSession()).rejects.toMatchObject({
      code: "not_paused",
    });

    await service.pauseSession();
    await expect(service.pauseSession()).rejects.toMatchObject({
      code: "already_paused",
    });
  });

  it("allows an untitled session and only enforces input lengths when provided", async () => {
    const untitled = await service.startSession({});

    expect(untitled.label).toBe("");
    expect(untitled.tag).toBeNull();
    await service.stopSession();

    await expect(
      service.startSession({ label: "x".repeat(201) }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      service.startSession({ label: "Valid", tag: "x".repeat(65) }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("treats a whitespace-only label as untitled", async () => {
    const session = await service.startSession({ label: "   " });
    expect(session.label).toBe("");
  });

  it("filters by IST date range, tag, and minimum active minutes", async () => {
    store.seed([
      makeSession({
        id: "first",
        start: new Date("2026-10-01T00:00:00+05:30"),
        end: new Date("2026-10-01T01:00:00+05:30"),
        label: "First",
        tag: "alpha",
      }),
      makeSession({
        id: "last",
        start: new Date("2026-10-01T23:59:00+05:30"),
        end: new Date("2026-10-02T00:39:00+05:30"),
        label: "Last",
        tag: "beta",
      }),
      makeSession({
        id: "next-day",
        start: new Date("2026-10-02T00:00:00+05:30"),
        end: new Date("2026-10-02T00:30:00+05:30"),
        label: "Next day",
        tag: "alpha",
      }),
    ]);

    const range = parseIstRange("2026-10-01", "2026-10-01");
    const inRange = await service.listSessions(range);
    expect(inRange.map((session) => session.id)).toEqual(["last", "first"]);

    const tagged = await service.listSessions({ ...range, tag: "alpha" });
    expect(tagged.map((session) => session.id)).toEqual(["first"]);

    const longEnough = await service.listSessions({
      ...range,
      minMinutes: 45,
    });
    expect(longEnough.map((session) => session.id)).toEqual(["first"]);
  });

  it("summarizes active minutes by IST day and tag in code", async () => {
    store.seed([
      makeSession({
        id: "a",
        start: new Date("2026-10-01T09:00:00+05:30"),
        end: new Date("2026-10-01T10:00:00+05:30"),
        pausedSeconds: 0,
        label: "A",
        tag: "alpha",
      }),
      makeSession({
        id: "b",
        start: new Date("2026-10-01T11:00:00+05:30"),
        end: new Date("2026-10-01T11:30:00+05:30"),
        pausedSeconds: 300,
        label: "B",
        tag: "beta",
      }),
      makeSession({
        id: "c",
        start: new Date("2026-10-02T09:00:00+05:30"),
        end: new Date("2026-10-02T10:30:00+05:30"),
        label: "C",
        tag: "alpha",
      }),
      makeSession({
        id: "untagged",
        start: new Date("2026-10-02T12:00:00+05:30"),
        end: new Date("2026-10-02T12:10:00+05:30"),
        label: "D",
      }),
    ]);

    const range = parseIstRange("2026-10-01", "2026-10-02");
    const summary = await service.summarize(range.from, range.to);

    expect(summary.sessionCount).toBe(4);
    expect(summary.totalActiveMinutes).toBe(185);
    expect(summary.averageSessionMinutes).toBe(46.3);
    expect(summary.activeMinutesByDay).toEqual({
      "2026-10-01": 85,
      "2026-10-02": 100,
    });
    expect(summary.activeMinutesByTag).toEqual({
      "(untagged)": 10,
      alpha: 150,
      beta: 25,
    });
  });
});
