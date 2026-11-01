import "./base.css";
import {
  appRoot,
  bootApp,
  clear,
  emptyState,
  formatDuration,
  formatRange,
  make,
  metric,
  readStructured,
  sectionHeader,
  showError,
  svg,
} from "./shared";

type HourlyBucket = {
  hour: number;
  active_seconds: number;
  active_minutes: number;
};

type WeekdayRow = {
  weekday: number;
  name: string;
  hours: HourlyBucket[];
  total_active_minutes: number;
};

type HourlyData = {
  from: string;
  to: string;
  hours: HourlyBucket[];
  total_active_minutes: number;
  session_count: number;
  weekday_breakdown: WeekdayRow[] | null;
  truncated: boolean;
};

const root = appRoot();

function render(data: HourlyData): void {
  clear(root);

  const header = sectionHeader(
    "Hourly heatmap",
    "Weekday × hour / IST",
    formatRange(data.from, data.to),
  );
  root.append(header);

  const peak = data.hours.reduce(
    (best, bucket) =>
      bucket.active_minutes > best.active_minutes ? bucket : best,
    data.hours[0] ?? { hour: 0, active_seconds: 0, active_minutes: 0 },
  );

  const metrics = make("div", "metric-row");
  metrics.append(metric("Total", formatDuration(data.total_active_minutes)));
  metrics.append(metric("Sessions", String(data.session_count)));
  metrics.append(
    metric(
      "Peak hour",
      peak.active_minutes > 0
        ? `${String(peak.hour).padStart(2, "0")}:00`
        : "—",
    ),
  );
  root.append(metrics);

  const rows = data.weekday_breakdown;
  if (!rows || rows.length === 0 || data.total_active_minutes <= 0) {
    emptyState(root, "No sessions in this range.");
    return;
  }

  const max = Math.max(
    1,
    ...rows.flatMap((row) =>
      row.hours.map((bucket) => bucket.active_minutes),
    ),
  );
  const left = 44;
  const top = 22;
  const cellWidth = 27;
  const cellHeight = 25;
  const width = left + 24 * cellWidth + 10;
  const height = top + rows.length * cellHeight + 24;

  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    class: "chart-svg heat-svg",
    role: "img",
    "aria-label": "Active minutes by weekday and IST hour",
  });

  for (let hour = 0; hour < 24; hour += 1) {
    if (hour % 3 !== 0) {
      continue;
    }

    const x = left + hour * cellWidth;
    const label = svg("text", {
      x: x + cellWidth / 2,
      y: top + rows.length * cellHeight + 16,
      class: "chart-label",
      "text-anchor": "middle",
    });
    label.textContent = String(hour).padStart(2, "0");
    chart.append(label);
  }

  rows.forEach((row, rowIndex) => {
    const y = top + rowIndex * cellHeight;
    const rowLabel = svg("text", {
      x: left - 8,
      y: y + cellHeight / 2 + 3,
      class: "chart-label",
      "text-anchor": "end",
    });
    rowLabel.textContent = row.name;
    chart.append(rowLabel);

    for (let hour = 0; hour < 24; hour += 1) {
      const value = row.hours[hour]?.active_minutes ?? 0;
      const intensity =
        value > 0 ? 0.12 + 0.88 * (value / max) : 0.035;
      const rect = svg("rect", {
        x: left + hour * cellWidth,
        y: y + 1,
        width: cellWidth - 2,
        height: cellHeight - 3,
        rx: 3,
        fill: "var(--app-accent)",
        opacity: intensity.toFixed(3),
      });
      const title = svg("title");
      title.textContent = `${row.name} ${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00 · ${formatDuration(value)}`;
      rect.append(title);
      chart.append(rect);
    }
  });

  const scroll = make("div", "heatmap-scroll");
  scroll.append(chart);
  root.append(scroll);

  const legend = make("div", "heatmap-legend");
  legend.append(make("span", "", "Less"));
  for (const opacity of [0.08, 0.28, 0.5, 0.72, 0.94]) {
    const swatch = make("span", "heat-swatch");
    swatch.style.opacity = String(opacity);
    legend.append(swatch);
  }
  legend.append(make("span", "", "More"));
  root.append(legend);

  if (data.truncated) {
    root.append(
      make(
        "p",
        "footnote",
        "Query hit the session cap; the heatmap may omit later sessions.",
      ),
    );
  }
}

function renderLoading(): void {
  clear(root);
  root.append(
    sectionHeader("Hourly heatmap", "Weekday × hour / IST", "Loading…"),
  );
  const loading = make("div", "empty");
  loading.append(make("h2", "empty-title", "Reading sessions…"));
  root.append(loading);
}

renderLoading();
bootApp("Worklog Hourly Heatmap", (result) => {
  if (result.isError) {
    showError(root, "The hourly summary could not be loaded.", firstText(result));
    return;
  }

  const data = readStructured<HourlyData>(result);
  if (!data) {
    showError(root, "No structured hourly summary was returned.");
    return;
  }

  render(data);
});

function firstText(result: { content?: Array<{ type: string; text?: string }> }): string {
  const first = result.content?.find((item) => item.type === "text");
  return first?.text ?? "Try again.";
}
