import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { activeMinutes, pausedMinutes } from "./active-time";
import {
  formatIstIso,
  formatIstTime,
  InvalidDateRangeError,
  parseIstInstant,
  parseIstRange,
} from "./ist-dates";
import { serializeSession } from "./serialization";
import { displaySessionLabel } from "./session-display";
import {
  SessionError,
  type SessionSummary,
  type UpdateSessionInput,
} from "./session-service";
import type { GoalRecord } from "./session-store";
import { getSessionService } from "./session-service-server";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function textResult(value: unknown): ToolResult {
  const result: ToolResult = {
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

  if (value && typeof value === "object" && !Array.isArray(value)) {
    result.structuredContent = value as Record<string, unknown>;
  }

  return result;
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

function goalForTool(goal: GoalRecord) {
  return {
    daily_minutes: goal.dailyMinutes,
    weekly_minutes: goal.weeklyMinutes,
    updated_at: formatIstIso(goal.updatedAt),
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
        "List work sessions whose start falls inside an inclusive date range. Dates and displayed timestamps use Asia/Kolkata. Optionally filter by case-insensitive tag and minimum active minutes.",
      inputSchema: z.object({
        from: z.string().min(1).describe(dateRangeDescription),
        to: z.string().min(1).describe(dateRangeDescription),
        tag: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .optional()
          .describe("Only return sessions with this tag, case-insensitive."),
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

  server.registerTool(
    "list_tags",
    {
      title: "List tags",
      description:
        "List the tags already used in the worklog, merged case-insensitively. Returns each tag's active minutes, session count, last use, and spelling variants, plus the untagged session count. Optionally restrict to a date range.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        from: z
          .string()
          .min(1)
          .optional()
          .describe(`Optional range start. ${dateRangeDescription}`),
        to: z
          .string()
          .min(1)
          .optional()
          .describe(`Optional range end. ${dateRangeDescription}`),
      }),
    },
    async ({ from, to }) =>
      runTool("list_tags", async () => {
        const fromDate = from ? parseIstInstant(from, "start") : undefined;
        const toDate = to ? parseIstInstant(to, "end") : undefined;

        if (
          fromDate &&
          toDate &&
          fromDate.getTime() > toDate.getTime()
        ) {
          throw new InvalidDateRangeError(
            '"from" must be before or equal to "to".',
          );
        }

        const result = await getSessionService().listTags({
          from: fromDate,
          to: toDate,
        });

        return {
          from: result.from ? formatIstIso(result.from) : null,
          to: result.to ? formatIstIso(result.to) : null,
          tags: result.tags.map((tag) => ({
            tag: tag.tag,
            tag_key: tag.tagKey,
            session_count: tag.sessionCount,
            active_minutes: tag.activeMinutes,
            last_used: formatIstIso(tag.lastUsed),
            last_session_id: tag.lastSessionId,
            variants: tag.variants.map((variant) => ({
              tag: variant.tag,
              session_count: variant.sessionCount,
            })),
          })),
          untagged_session_count: result.untaggedSessionCount,
          truncated: result.truncated,
        };
      }),
  );

  server.registerTool(
    "update_session",
    {
      title: "Update a session",
      description:
        "Edit a past or active session's label, tag, start, or end. Setting end trims the session and, if it is active, completes it. Omitted fields stay unchanged; null clears label or tag. Active minutes are recomputed. Returns the updated session and its id.",
      annotations: { destructiveHint: true, idempotentHint: true },
      inputSchema: z.object({
        id: z.string().min(1).describe("Session id from list_sessions."),
        label: z
          .string()
          .trim()
          .max(200, "Label must be 200 characters or fewer.")
          .nullable()
          .optional()
          .describe("New label. Use null or an empty string to clear it."),
        tag: z
          .string()
          .trim()
          .max(64, "Tag must be 64 characters or fewer.")
          .nullable()
          .optional()
          .describe("New tag. Use null or an empty string to clear it."),
        start: z
          .string()
          .min(1)
          .optional()
          .describe(
            `New start instant. ${dateRangeDescription} A date-only value means the start of that IST day.`,
          ),
        end: z
          .string()
          .min(1)
          .optional()
          .describe(
            `New end instant. ${dateRangeDescription} A date-only value means the end of that IST day. The resulting end must not be in the future. Setting end completes an active session.`,
          ),
      }),
    },
    async ({ id, label, tag, start, end }) =>
      runTool("update_session", async () => {
        const input: UpdateSessionInput = { id };
        if (label !== undefined) {
          input.label = label;
        }
        if (tag !== undefined) {
          input.tag = tag;
        }
        if (start !== undefined) {
          input.start = parseIstInstant(start, "start");
        }
        if (end !== undefined) {
          input.end = parseIstInstant(end, "end");
        }

        const result = await getSessionService().updateSession(input);
        const at = result.session.end ?? new Date();

        return {
          session_id: result.session.id,
          adjusted_paused_seconds: result.adjustedPausedSeconds,
          session: serializeSession(result.session, at),
        };
      }),
  );

  server.registerTool(
    "delete_session",
    {
      title: "Delete a session",
      description:
        "Delete a session permanently. Use it for junk or accidental sessions. If the session is active, the active pointer is cleared. Returns the deleted session.",
      annotations: { destructiveHint: true, idempotentHint: false },
      inputSchema: z.object({
        id: z.string().min(1).describe("Session id from list_sessions."),
      }),
    },
    async ({ id }) =>
      runTool("delete_session", async () => {
        const result = await getSessionService().deleteSession(id);
        const at = result.session.end ?? new Date();

        return {
          session_id: result.session.id,
          was_active: result.wasActive,
          deleted_session: serializeSession(result.session, at),
        };
      }),
  );

  server.registerTool(
    "retag_sessions",
    {
      title: "Retag sessions in a range",
      description:
        "Bulk-assign one tag to sessions whose start falls inside a date range. By default only untagged sessions are changed; set only_untagged to false to retag everything in the range. Returns the updated session ids and counts.",
      annotations: { destructiveHint: true, idempotentHint: true },
      inputSchema: z.object({
        from: z.string().min(1).describe(dateRangeDescription),
        to: z.string().min(1).describe(dateRangeDescription),
        tag: z
          .string()
          .trim()
          .min(1)
          .max(64, "Tag must be 64 characters or fewer.")
          .describe("Tag to apply."),
        only_untagged: z
          .boolean()
          .default(true)
          .describe("Only change sessions without a tag. Defaults to true."),
      }),
    },
    async ({ from, to, tag, only_untagged }) =>
      runTool("retag_sessions", async () => {
        const range = parseIstRange(from, to);
        const result = await getSessionService().retagSessions({
          ...range,
          tag,
          onlyUntagged: only_untagged,
        });

        return {
          from: formatIstIso(result.from),
          to: formatIstIso(result.to),
          tag: result.tag,
          only_untagged: result.onlyUntagged,
          matched_count: result.matchedCount,
          updated_count: result.updatedCount,
          skipped_count: result.skippedCount,
          session_ids: result.sessionIds,
          truncated: result.truncated,
        };
      }),
  );

  server.registerTool(
    "summary_by_hour",
    {
      title: "Summarize active minutes by hour",
      description:
        "Return 24 hourly active-minute buckets in IST for a date range. Sessions are split across hour boundaries. Optionally include a Monday-Sunday by hour matrix.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        from: z.string().min(1).describe(dateRangeDescription),
        to: z.string().min(1).describe(dateRangeDescription),
        include_weekday_breakdown: z
          .boolean()
          .default(false)
          .describe("Include a 7-day by 24-hour breakdown."),
      }),
    },
    async ({ from, to, include_weekday_breakdown }) =>
      runTool("summary_by_hour", async () => {
        const range = parseIstRange(from, to);
        const result = await getSessionService().summaryByHour({
          ...range,
          includeWeekdayBreakdown: include_weekday_breakdown,
        });

        return {
          from: result.from,
          to: result.to,
          hours: result.hours.map((bucket) => ({
            hour: bucket.hour,
            active_seconds: bucket.activeSeconds,
            active_minutes: bucket.activeMinutes,
          })),
          total_active_minutes: result.totalActiveMinutes,
          session_count: result.sessionCount,
          weekday_breakdown: result.weekdayBreakdown?.map((row) => ({
            weekday: row.weekday,
            name: row.name,
            hours: row.hours.map((bucket) => ({
              hour: bucket.hour,
              active_seconds: bucket.activeSeconds,
              active_minutes: bucket.activeMinutes,
            })),
            total_active_minutes: row.totalActiveMinutes,
          })) ?? null,
          truncated: result.truncated,
        };
      }),
  );

  server.registerTool(
    "list_gaps",
    {
      title: "List gaps between sessions",
      description:
        "Return gaps between consecutive sessions, per-day first start and last end, day span vs active focus, median break length, and pause counts. Gaps shorter than min_gap_minutes are omitted.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        from: z.string().min(1).describe(dateRangeDescription),
        to: z.string().min(1).describe(dateRangeDescription),
        min_gap_minutes: z
          .number()
          .min(0)
          .default(5)
          .describe("Minimum gap to report, in minutes. Defaults to 5."),
      }),
    },
    async ({ from, to, min_gap_minutes }) =>
      runTool("list_gaps", async () => {
        const range = parseIstRange(from, to);
        const result = await getSessionService().listGaps({
          ...range,
          minGapMinutes: min_gap_minutes,
        });

        return {
          from: result.from,
          to: result.to,
          gaps: result.gaps.map((gap) => ({
            after_session_id: gap.afterSessionId,
            before_session_id: gap.beforeSessionId,
            end: gap.end,
            start: gap.start,
            gap_minutes: gap.gapMinutes,
            same_day: gap.sameDay,
          })),
          overlaps: result.overlaps.map((overlap) => ({
            after_session_id: overlap.afterSessionId,
            before_session_id: overlap.beforeSessionId,
            overlap_minutes: overlap.overlapMinutes,
          })),
          day_spans: result.daySpans.map((day) => ({
            date: day.date,
            first_start: day.firstStart,
            last_end: day.lastEnd,
            span_minutes: day.spanMinutes,
            active_minutes: day.activeMinutes,
            paused_minutes: day.pausedMinutes,
            focus_ratio: day.focusRatio,
            session_count: day.sessionCount,
          })),
          median_break_minutes: result.medianBreakMinutes,
          median_all_gap_minutes: result.medianAllGapMinutes,
          overnight_gap_count: result.overnightGapCount,
          paused_session_count: result.pausedSessionCount,
          pause_event_count: result.pauseEventCount,
          total_paused_minutes: result.totalPausedMinutes,
          session_count: result.sessionCount,
          truncated: result.truncated,
        };
      }),
  );

  server.registerTool(
    "set_goal",
    {
      title: "Set daily and weekly goals",
      description:
        "Set the daily active-minute target and optionally the weekly target. Omitting weekly_minutes keeps the existing weekly target; null clears it. Returns the stored goal.",
      annotations: { idempotentHint: true },
      inputSchema: z.object({
        daily_minutes: z
          .number()
          .min(1)
          .max(1440)
          .describe("Daily active-minute target."),
        weekly_minutes: z
          .number()
          .min(1)
          .max(10080)
          .nullable()
          .optional()
          .describe(
            "Weekly active-minute target. Omit to keep the existing value; null clears it.",
          ),
      }),
    },
    async ({ daily_minutes, weekly_minutes }) =>
      runTool("set_goal", async () => {
        const goal = await getSessionService().setGoal({
          dailyMinutes: daily_minutes,
          weeklyMinutes: weekly_minutes,
        });
        return { goal: goalForTool(goal) };
      }),
  );

  server.registerTool(
    "goal_progress",
    {
      title: "Show goal progress",
      description:
        "Report active minutes per IST day against the daily goal, days that hit it, current and longest daily streak, and weekly progress. Evaluates whole IST days through today and only reports data.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        from: z.string().min(1).describe(dateRangeDescription),
        to: z.string().min(1).describe(dateRangeDescription),
      }),
    },
    async ({ from, to }) =>
      runTool("goal_progress", async () => {
        const range = parseIstRange(from, to);
        const result = await getSessionService().goalProgress(
          range.from,
          range.to,
        );

        return {
          from: result.from,
          to: result.to,
          as_of: result.asOf,
          goal: result.goal
            ? {
                daily_minutes: result.goal.dailyMinutes,
                weekly_minutes: result.goal.weeklyMinutes,
                updated_at: result.goal.updatedAt,
              }
            : null,
          days: result.days.map((day) => ({
            date: day.date,
            active_seconds: day.activeSeconds,
            active_minutes: day.activeMinutes,
            target_minutes: day.targetMinutes,
            met: day.met,
            progress_ratio: day.progressRatio,
            session_count: day.sessionCount,
          })),
          days_hit: result.daysHit,
          current_streak: result.currentStreak,
          longest_streak: result.longestStreak,
          today_met: result.todayMet,
          today_pending: result.todayPending,
          weeks: result.weeks.map((week) => ({
            week_start: week.weekStart,
            week_end: week.weekEnd,
            active_minutes: week.activeMinutes,
            target_minutes: week.targetMinutes,
            met: week.met,
            progress_ratio: week.progressRatio,
            partial: week.partial,
          })),
          truncated: result.truncated,
        };
      }),
  );

  server.registerTool(
    "compare_periods",
    {
      title: "Compare two periods",
      description:
        "Compare two date ranges: total active minutes, session counts, average and longest session, active days, and per-tag minutes, with B-minus-A deltas and percentages.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        a_from: z.string().min(1).describe(dateRangeDescription),
        a_to: z.string().min(1).describe(dateRangeDescription),
        b_from: z.string().min(1).describe(dateRangeDescription),
        b_to: z.string().min(1).describe(dateRangeDescription),
      }),
    },
    async ({ a_from, a_to, b_from, b_to }) =>
      runTool("compare_periods", async () => {
        const a = parseIstRange(a_from, a_to);
        const b = parseIstRange(b_from, b_to);
        const result = await getSessionService().comparePeriods({
          aFrom: a.from,
          aTo: a.to,
          bFrom: b.from,
          bTo: b.to,
        });

        const period = (stats: typeof result.periodA) => ({
          from: stats.from,
          to: stats.to,
          total_active_minutes: stats.totalActiveMinutes,
          session_count: stats.sessionCount,
          completed_session_count: stats.completedSessionCount,
          running_session_count: stats.runningSessionCount,
          average_session_minutes: stats.averageSessionMinutes,
          longest_session_minutes: stats.longestSessionMinutes,
          active_days: stats.activeDays,
          active_minutes_by_tag: stats.activeMinutesByTag,
        });

        return {
          period_a: period(result.periodA),
          period_b: period(result.periodB),
          delta: {
            total_active_minutes: result.delta.totalActiveMinutes,
            session_count: result.delta.sessionCount,
            completed_session_count: result.delta.completedSessionCount,
            average_session_minutes: result.delta.averageSessionMinutes,
            longest_session_minutes: result.delta.longestSessionMinutes,
            active_days: result.delta.activeDays,
          },
          delta_percent: {
            total_active_minutes: result.deltaPercent.totalActiveMinutes,
            session_count: result.deltaPercent.sessionCount,
            completed_session_count:
              result.deltaPercent.completedSessionCount,
            average_session_minutes:
              result.deltaPercent.averageSessionMinutes,
            longest_session_minutes:
              result.deltaPercent.longestSessionMinutes,
            active_days: result.deltaPercent.activeDays,
          },
          tag_deltas: result.tagDeltas.map((tag) => ({
            tag: tag.tag,
            a_minutes: tag.aMinutes,
            b_minutes: tag.bMinutes,
            delta_minutes: tag.deltaMinutes,
            delta_percent: tag.deltaPercent,
          })),
          truncated: result.truncated,
        };
      }),
  );

  server.registerTool(
    "weekly_trend",
    {
      title: "Show weekly trend",
      description:
        "Return one row per Monday-Sunday IST week for the last N weeks, including the current partial week. Rows include active minutes, session counts, averages, active days, tag minutes, and week-over-week deltas.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        weeks: z
          .number()
          .int()
          .min(1)
          .max(52)
          .describe("Number of weeks, from 1 to 52."),
      }),
    },
    async ({ weeks }) =>
      runTool("weekly_trend", async () => {
        const result = await getSessionService().weeklyTrend(weeks);

        return {
          range_start: result.rangeStart,
          range_end: result.rangeEnd,
          as_of: result.asOf,
          weeks: result.weeks.map((week) => ({
            week_start: week.weekStart,
            week_end: week.weekEnd,
            partial: week.partial,
            total_active_minutes: week.totalActiveMinutes,
            session_count: week.sessionCount,
            completed_session_count: week.completedSessionCount,
            running_session_count: week.runningSessionCount,
            average_session_minutes: week.averageSessionMinutes,
            longest_session_minutes: week.longestSessionMinutes,
            active_days: week.activeDays,
            active_minutes_by_tag: week.activeMinutesByTag,
            delta_from_previous_week_minutes:
              week.deltaFromPreviousWeekMinutes,
            delta_percent_from_previous_week:
              week.deltaPercentFromPreviousWeek,
          })),
          truncated: result.truncated,
        };
      }),
  );
}
