import { describe, expect, it } from "vitest";
import { mapSessionDoc } from "@/lib/client-session-mapper";

function timestamp(iso: string) {
  return {
    toDate: () => new Date(iso),
  };
}

describe("client session mapper", () => {
  it("keeps an untitled session in the live listener", () => {
    const start = "2026-10-25T11:30:00.000Z";
    const session = mapSessionDoc("session-id", {
      id: "session-id",
      start: timestamp(start),
      end: null,
      paused_seconds: 0,
      paused_at: null,
      label: "",
      tag: "",
    });

    expect(session).not.toBeNull();
    expect(session?.label).toBe("");
    expect(session?.tag).toBeNull();
    expect(session?.start.toISOString()).toBe(start);
    expect(session?.end).toBeNull();
  });

  it("drops documents without a usable start timestamp", () => {
    expect(
      mapSessionDoc("broken", {
        label: "Missing start",
        end: null,
      }),
    ).toBeNull();
  });
});
