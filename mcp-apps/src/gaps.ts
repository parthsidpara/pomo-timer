import "./base.css";
import {
  appRoot,
  bootApp,
  clear,
  dateHeading,
  emptyState,
  formatDuration,
  formatPercent,
  formatRange,
  formatTime,
  istDateKey,
  make,
  metric,
  readStructured,
  sectionHeader,
  showError,
  tagColor,
} from "./shared";

type Gap = {
  after_session_id: string;
  before_session_id: string;
  end: string;
  start: string;
  gap_minutes: number;
  same_day: boolean;
};

type DaySpan = {
  date: string;
  first_start: string;
  last_end: string;
  span_minutes: number;
  active_minutes: number;
  paused_minutes: number;
  focus_ratio: number | null;
  session_count: number;
};

type TimelineSession = {
  id: string;
  label: string;
  tag: string | null;
  start: string;
  end: string;
  active_minutes: number;
  paused_minutes: number;
  running: boolean;
};

type GapData = {
  from: string;
  to: string;
  gaps: Gap[];
  overlaps: Array<{
    after_session_id: string;
    before_session_id: string;
    overlap_minutes: number;
  }>;
  day_spans: DaySpan[];
  sessions: TimelineSession[];
  median_break_minutes: number | null;
  median_all_gap_minutes: number | null;
  overnight_gap_count: number;
  paused_session_count: number;
  pause_event_count: number;
  total_paused_minutes: number;
  session_count: number;
  truncated: boolean;
};

const root = appRoot();

function render(data: GapData): void {
  clear(root);

  const header = sectionHeader(
    "Gap timeline",
    "Sessions & breaks / IST",
    formatRange(data.from, data.to),
  );
  root.append(header);

  const metrics = make("div", "metric-row");
  metrics.append(metric("Sessions", String(data.session_count)));
  metrics.append(
    metric(
      "Median break",
      data.median_break_minutes === null
        ? "—"
        : formatDuration(data.median_break_minutes),
    ),
  );
  metrics.append(metric("Overnight gaps", String(data.overnight_gap_count)));
  metrics.append(
    metric("Paused sessions", String(data.paused_session_count)),
  );
  metrics.append(metric("Pause events", String(data.pause_event_count)));
  metrics.append(
    metric("Paused time", formatDuration(data.total_paused_minutes)),
  );
  root.append(metrics);

  if (data.sessions.length === 0 || data.day_spans.length === 0) {
    emptyState(root, "No sessions in this range.");
    return;
  }

  const sessionsByDay = new Map<string, TimelineSession[]>();
  for (const session of data.sessions) {
    const key = istDateKey(session.start);
    const list = sessionsByDay.get(key) ?? [];
    list.push(session);
    sessionsByDay.set(key, list);
  }

  const list = make("div", "timeline-list");
  for (const day of data.day_spans) {
    const card = make("article", "day-card");
    const head = make("div", "day-head");
    const copy = make("div");
    copy.append(make("h2", "day-title", dateHeading(day.date)));
    copy.append(
      make(
        "p",
        "day-meta",
        `${day.session_count} ${day.session_count === 1 ? "session" : "sessions"} · ${formatDuration(day.span_minutes)} span · ${formatDuration(day.active_minutes)} active`,
      ),
    );
    head.append(copy);
    head.append(
      make(
        "p",
        "day-meta",
        day.focus_ratio === null
          ? "—"
          : `${formatPercent(day.focus_ratio * 100)} focus`,
      ),
    );
    card.append(head);

    const startMs = new Date(day.first_start).getTime();
    const endMs = new Date(day.last_end).getTime();
    const span = Math.max(1, endMs - startMs);
    const track = make("div", "timeline-track");
    track.setAttribute(
      "aria-label",
      `${dateHeading(day.date)} timeline from ${formatTime(day.first_start)} to ${formatTime(day.last_end)}`,
    );

    for (const session of sessionsByDay.get(day.date) ?? []) {
      const sessionStart = Math.max(startMs, new Date(session.start).getTime());
      const sessionEnd = Math.min(endMs, new Date(session.end).getTime());
      if (sessionEnd <= sessionStart) {
        continue;
      }

      const bar = make(
        "span",
        `timeline-bar${session.running ? " is-running" : ""}`,
      );
      bar.style.left = `${((sessionStart - startMs) / span) * 100}%`;
      bar.style.width = `${Math.max(0.6, ((sessionEnd - sessionStart) / span) * 100)}%`;
      bar.style.setProperty(
        "--bar-color",
        tagColor(session.tag),
      );
      bar.title = `${session.label || "Untitled session"}${session.tag ? ` · ${session.tag}` : ""} · ${formatTime(session.start)}–${formatTime(session.end)} · ${formatDuration(session.active_minutes)}`;
      track.append(bar);
    }

    card.append(track);
    const times = make("div", "timeline-times");
    times.append(make("span", "", formatTime(day.first_start)));
    times.append(make("span", "", formatTime(day.last_end)));
    card.append(times);

    list.append(card);
  }
  root.append(list);

  if (data.gaps.length > 0) {
    const wrap = make("div", "gap-table-wrap");
    const table = make("table", "gap-table");
    const head = make("thead");
    const headRow = make("tr");
    headRow.append(make("th", "", "Break"));
    headRow.append(make("th", "", "Gap"));
    head.append(headRow);
    table.append(head);

    const body = make("tbody");
    for (const gap of data.gaps) {
      const row = make("tr");
      row.append(
        make(
          "td",
          "",
          `${formatTime(gap.end)} – ${formatTime(gap.start)}${gap.same_day ? "" : " · overnight"}`,
        ),
      );
      row.append(make("td", "", formatDuration(gap.gap_minutes)));
      body.append(row);
    }
    table.append(body);
    wrap.append(table);
    root.append(wrap);
  } else {
    root.append(make("p", "footnote", "No qualifying breaks in this range."));
  }

  if (data.overlaps.length > 0) {
    root.append(
      make(
        "p",
        "footnote",
        `${data.overlaps.length} overlapping session pair${data.overlaps.length === 1 ? "" : "s"} detected.`,
      ),
    );
  }
  if (data.truncated) {
    root.append(
      make(
        "p",
        "footnote",
        "Query hit the session cap; the timeline may omit later sessions.",
      ),
    );
  }
}

function renderLoading(): void {
  clear(root);
  root.append(
    sectionHeader("Gap timeline", "Sessions & breaks / IST", "Loading…"),
  );
  const loading = make("div", "empty");
  loading.append(make("h2", "empty-title", "Reading sessions…"));
  root.append(loading);
}

renderLoading();
bootApp("Worklog Gap Timeline", (result) => {
  if (result.isError) {
    showError(root, "The gap analysis could not be loaded.", firstText(result));
    return;
  }

  const data = readStructured<GapData>(result);
  if (!data) {
    showError(root, "No structured gap analysis was returned.");
    return;
  }

  render(data);
});

function firstText(result: { content?: Array<{ type: string; text?: string }> }): string {
  const first = result.content?.find((item) => item.type === "text");
  return first?.text ?? "Try again.";
}
