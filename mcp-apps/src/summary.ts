import "./base.css";
import {
  appRoot,
  bootApp,
  clear,
  dayMonth,
  emptyState,
  formatDuration,
  formatRange,
  legendItem,
  make,
  metric,
  readStructured,
  sectionHeader,
  showError,
  svg,
  tagColor,
  weekdayShort,
} from "./shared";

type SummaryData = {
  from: string;
  to: string;
  total_active_minutes: number;
  session_count: number;
  average_session_minutes: number | null;
  active_minutes_by_day: Record<string, number>;
  active_minutes_by_tag: Record<string, number>;
  active_minutes_by_day_and_tag?: Record<string, Record<string, number>>;
};

const root = appRoot();

function render(data: SummaryData): void {
  clear(root);

  const range = formatRange(data.from, data.to);
  const header = sectionHeader(
    "Daily active time",
    "Summary / IST",
    range,
  );
  root.append(header);

  const metrics = make("div", "metric-row");
  metrics.append(metric("Total", formatDuration(data.total_active_minutes)));
  metrics.append(metric("Sessions", String(data.session_count)));
  metrics.append(
    metric(
      "Avg session",
      data.average_session_minutes === null
        ? "—"
        : formatDuration(data.average_session_minutes),
    ),
  );
  root.append(metrics);

  const days = Object.keys(data.active_minutes_by_day).sort();
  const total = days.reduce(
    (sum, day) => sum + (data.active_minutes_by_day[day] ?? 0),
    0,
  );

  if (days.length === 0 || total <= 0) {
    emptyState(root, "No sessions in this range.");
    return;
  }

  const tags = Object.keys(data.active_minutes_by_tag)
    .filter((tag) => (data.active_minutes_by_tag[tag] ?? 0) > 0)
    .sort(
      (a, b) =>
        (data.active_minutes_by_tag[b] ?? 0) -
          (data.active_minutes_by_tag[a] ?? 0) ||
        a.localeCompare(b),
    );
  const tagOrder = new Map(tags.map((tag, index) => [tag, index]));
  const untagged = "(untagged)";
  if (!tagOrder.has(untagged)) {
    // Keep untagged visible in the legend when it appears in the daily data.
    tagOrder.set(untagged, tags.length);
  }

  const barWidth = 42;
  const gap = 14;
  const left = 54;
  const right = 22;
  const top = 34;
  const chartHeight = 220;
  const bottom = 38;
  const width = left + days.length * (barWidth + gap) + right;
  const height = top + chartHeight + bottom;
  const maxDay = Math.max(
    1,
    ...days.map((day) => data.active_minutes_by_day[day] ?? 0),
  );

  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    class: "chart-svg",
    role: "img",
    "aria-label": "Daily active time stacked by tag",
  });

  for (let index = 0; index <= 4; index += 1) {
    const value = (maxDay * index) / 4;
    const y = top + chartHeight - (index / 4) * chartHeight;
    chart.append(
      svg("line", {
        x1: left,
        x2: width - right,
        y1: y,
        y2: y,
        class: "chart-grid",
      }),
    );
    chart.append(
      svg(
        "text",
        {
          x: left - 8,
          y: y + 3,
          class: "chart-label",
          "text-anchor": "end",
        },
        // svg() does not accept text children; set it below.
      ),
    );
    const label = chart.lastElementChild as SVGTextElement | null;
    if (label) {
      label.textContent = formatDuration(value);
    }
  }

  chart.append(
    svg("line", {
      x1: left,
      x2: width - right,
      y1: top + chartHeight,
      y2: top + chartHeight,
      class: "chart-axis",
    }),
  );

  for (let index = 0; index < days.length; index += 1) {
    const day = days[index];
    const dayTotal = data.active_minutes_by_day[day] ?? 0;
    const x = left + index * (barWidth + gap);
    const byTag = data.active_minutes_by_day_and_tag?.[day];
    const segments = byTag
      ? Object.entries(byTag)
          .filter(([, minutes]) => minutes > 0)
          .sort(
            ([a], [b]) =>
              (tagOrder.get(a) ?? 99) - (tagOrder.get(b) ?? 99) ||
              a.localeCompare(b),
          )
      : dayTotal > 0
        ? [[untagged, dayTotal] as const]
        : [];
    let bottomY = top + chartHeight;

    for (const [tag, minutes] of segments) {
      const segmentHeight = (minutes / maxDay) * chartHeight;
      const rect = svg("rect", {
        x,
        y: bottomY - segmentHeight,
        width: barWidth,
        height: segmentHeight,
        rx: 2,
        fill: tagColor(tag === untagged ? null : tag),
        opacity: 0.92,
      });
      const title = svg("title");
      title.textContent = `${tag}: ${formatDuration(minutes)}`;
      rect.append(title);
      chart.append(rect);
      bottomY -= segmentHeight;
    }

    if (dayTotal > 0) {
      const value = svg("text", {
        x: x + barWidth / 2,
        y: top + chartHeight - (dayTotal / maxDay) * chartHeight - 7,
        class: "chart-value",
      });
      value.textContent = formatDuration(dayTotal);
      chart.append(value);
    }

    const label = svg("text", {
      x: x + barWidth / 2,
      y: top + chartHeight + 19,
      class: "chart-label",
      "text-anchor": "middle",
    });
    label.textContent = days.length > 10 ? dayMonth(day) : weekdayShort(day);
    const title = svg("title");
    title.textContent = `${dayMonth(day)} · ${formatDuration(dayTotal)}`;
    label.append(title);
    chart.append(label);
  }

  const scroll = make("div", "chart-scroll");
  scroll.append(chart);
  root.append(scroll);

  if (tags.length > 0) {
    const legend = make("div", "legend");
    for (const tag of tags) {
      legend.append(
        legendItem(
          tag,
          tagColor(tag === untagged ? null : tag),
        ),
      );
    }
    root.append(legend);
  }

  root.append(
    make(
      "p",
      "footnote",
      "Stacked by tag · pauses excluded · running session included to now",
    ),
  );
}

function renderLoading(): void {
  clear(root);
  root.append(sectionHeader("Daily active time", "Summary / IST", "Loading…"));
  const loading = make("div", "empty");
  loading.append(make("h2", "empty-title", "Reading sessions…"));
  root.append(loading);
}

renderLoading();
bootApp("Worklog Summary", (result) => {
  if (result.isError) {
    showError(root, "The summary could not be loaded.", firstText(result));
    return;
  }

  const data = readStructured<SummaryData>(result);
  if (!data) {
    showError(root, "No structured summary was returned.");
    return;
  }

  render(data);
});

function firstText(result: { content?: Array<{ type: string; text?: string }> }): string {
  const first = result.content?.find((item) => item.type === "text");
  return first?.text ?? "Try running summary again.";
}
