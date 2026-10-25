import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { activeMinutes, pausedMinutes } from "./active-time";
import {
  formatIstIso,
  formatIstTime,
  InvalidDateRangeError,
  parseIstRange,
} from "./ist-dates";
import { serializeSession } from "./serialization";
import { displaySessionLabel } from "./session-display";
import {
  SessionError,
  type SessionSummary,
} from "./session-service";
import { getSessionService } from "./session-service-server";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function textResult(value: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text:
          typeof value === "string"
            ? value
            : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(message: string): ToolResult {
  return {
    ...textResult({ error: message }),
    isError: true,
  };
}

async function runTool(
  name: string,
  action: () => Promise<unknown>,
): Promise<ToolResult> {
  try {
    return textResult(await action());
  } catch (error) {
    if (error instanceof SessionError || error instanceof InvalidDateRangeError) {
      return errorResult(error.message);
    }

    console.error(`[mcp] ${name} failed`, error);
    return errorResult(
      "The worklog service could not complete that request. Check the server logs and Firebase configuration.",
    );
  }
}

function summaryForTool(summary: SessionSummary) {
  return {
    from: formatIstIso(summary.from),
    to: formatIstIso(summary.to),
    total_active_minutes: summary.totalActiveMinutes,
    session_count: summary.sessionCount,
    average_session_minutes: summary.averageSessionMinutes,
    active_minutes_by_day: summary.activeMinutesByDay,
    active_minutes_by_tag: summary.activeMinutesByTag,
  };
}

const dateRangeDescription =
  "ISO 8601 date or datetime. A date-only value (YYYY-MM-DD) covers the whole Asia/Kolkata day; a datetime without an offset is interpreted as Asia/Kolkata.";

export function registerTools(server: McpServer): void {
  server.registerTool(
    "start_session",
    {
      title: "Start work session",
      description:
        "Start a work session with optional label and tag. Fails clearly if a session is already running. Times use Asia/Kolkata for display.",
      inputSchema: z.object({
        label: z
          .string()
          .trim()
          .max(200, "Label must be 200 characters or fewer.")
          .optional()
          .nullable()
          .describe(
            "Optional name for what you are working on. Omit it for an untitled session.",
          ),
        tag: z
          .string()
          .trim()
          .max(64, "Tag must be 64 characters or fewer.")
          .optional()
          .describe("Optional project or tag, such as a project name."),
      }),
    },
    async ({ label, tag }) =>
      runTool("start_session", async () => {
        const session = await getSessionService().startSession({ label, tag });
        return {
          message: `Started "${displaySessionLabel(session.label)}" at ${formatIstTime(session.start)} IST.`,
          session: serializeSession(session, new Date()),
        };
      }),
  );

  server.registerTool(
    "pause_session",
    {
      title: "Pause current session",
      description:
        "Pause the running work session. Active time stops accumulating until resume_session is called.",
      inputSchema: z.object({}),
    },
    async () =>
      runTool("pause_session", async () => {
        const session = await getSessionService().pauseSession();
        return {
          message: `Paused "${displaySessionLabel(session.label)}" at ${formatIstTime(session.pausedAt ?? new Date())} IST.`,
          session: serializeSession(session, new Date()),
        };
      }),
  );

  server.registerTool(
    "resume_session",
    {
      title: "Resume current session",
      description:
        "Resume a paused work session. Active time continues from where it stopped.",
      inputSchema: z.object({}),
    },
    async () =>
      runTool("resume_session", async () => {
        const session = await getSessionService().resumeSession();
        return {
          message: `Resumed "${displaySessionLabel(session.label)}" at ${formatIstTime(new Date())} IST.`,
          session: serializeSession(session, new Date()),
        };
      }),
  );

  server.registerTool(
    "stop_session",
    {
      title: "Stop current session",
      description:
        "Stop the running or paused work session and return its final summary: start, end, active minutes, paused minutes, label, and tag.",
      inputSchema: z.object({}),
    },
    async () =>
      runTool("stop_session", async () => {
        const session = await getSessionService().stopSession();
        return {
          message: `Stopped "${displaySessionLabel(session.label)}": ${activeMinutes(session, session.end ?? new Date())} active minutes, ${pausedMinutes(session, session.end ?? new Date())} paused minutes.`,
          session: serializeSession(session, session.end ?? new Date()),
        };
      }),
  );

  server.registerTool(
    "current_session",
    {
      title: "Show current session",
      description:
        "Return the currently running or paused session with its elapsed active time. Returns null if no session is running.",
      inputSchema: z.object({}),
    },
    async () =>
      runTool("current_session", async () => {
        const session = await getSessionService().currentSession();
        if (!session) {
          return {
            message: "No session is running.",
            session: null,
          };
        }

        return {
          message: session.pausedAt
            ? `"${displaySessionLabel(session.label)}" is paused.`
            : `"${displaySessionLabel(session.label)}" is running.`,
          session: serializeSession(session, new Date()),
        };
      }),
  );

  server.registerTool(
    "list_sessions",
    {
      title: "List sessions",
      description:
        "List work sessions whose start falls inside an inclusive date range. Dates and displayed timestamps use Asia/Kolkata. Optionally filter by exact tag and minimum active minutes.",
      inputSchema: z.object({
        from: z.string().min(1).describe(dateRangeDescription),
        to: z.string().min(1).describe(dateRangeDescription),
        tag: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .optional()
          .describe("Only return sessions with this exact tag."),
        min_minutes: z
          .number()
          .min(0)
          .optional()
          .describe("Only return sessions with at least this many active minutes."),
      }),
    },
    async ({ from, to, tag, min_minutes }) =>
      runTool("list_sessions", async () => {
        const range = parseIstRange(from, to);
        const sessions = await getSessionService().listSessions({
          ...range,
          tag,
          minMinutes: min_minutes,
        });
        const at = new Date();

        return {
          from: formatIstIso(range.from),
          to: formatIstIso(range.to),
          session_count: sessions.length,
          sessions: sessions.map((session) => serializeSession(session, at)),
        };
      }),
  );

  server.registerTool(
    "summary",
    {
      title: "Summarize work sessions",
      description:
        "Summarize sessions by IST start day and tag: active minutes per day, active minutes per tag, session count, and average session length. A running session contributes its active time so far.",
      inputSchema: z.object({
        from: z.string().min(1).describe(dateRangeDescription),
        to: z.string().min(1).describe(dateRangeDescription),
      }),
    },
    async ({ from, to }) =>
      runTool("summary", async () => {
        const range = parseIstRange(from, to);
        const summary = await getSessionService().summarize(
          range.from,
          range.to,
        );
        return summaryForTool(summary);
      }),
  );
}
