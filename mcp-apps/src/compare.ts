import "./base.css";
import {
  appRoot,
  bootApp,
  clear,
  emptyState,
  formatDuration,
  formatRange,
  make,
  readStructured,
  sectionHeader,
  showError,
  tagColor,
} from "./shared";

type PeriodStats = {
  from: string;
  to: string;
  total_active_minutes: number;
  session_count: number;
  completed_session_count: number;
  running_session_count: number;
  average_session_minutes: number | null;
  longest_session_minutes: number | null;
  active_days: number;
  active_minutes_by_tag: Record<string, number>;
};

type ComparisonData = {
  period_a: PeriodStats;
  period_b: PeriodStats;
  delta: {
    total_active_minutes: number;
    session_count: number;
    completed_session_count: number;
    average_session_minutes: number | null;
    longest_session_minutes: number | null;
    active_days: number;
  };
  delta_percent: {
    total_active_minutes: number | null;
    session_count: number | null;
    completed_session_count: number | null;
    average_session_minutes: number | null;
    longest_session_minutes: number | null;
    active_days: number | null;
  };
  tag_deltas: Array<{
    tag: string;
    a_minutes: number;
    b_minutes: number;
    delta_minutes: number;
    delta_percent: number | null;
  }>;
  truncated: { a: boolean; b: boolean };
};

const root = appRoot();

function render(data: ComparisonData): void {
  clear(root);

  const header = sectionHeader(
    "Period comparison",
    "A vs B / IST",
    "Delta = B − A",
  );
  root.append(header);

  if (
    data.period_a.total_active_minutes === 0 &&
    data.period_b.total_active_minutes === 0
  ) {
    emptyState(root, "No sessions in either period.");
    return;
  }

  const grid = make("div", "compare-grid");
  grid.append(periodCard("Period A", data.period_a));
  grid.append(periodCard("Period B", data.period_b));
  root.append(grid);

  const deltaRow = make("div", "delta-row");
  deltaRow.append(
    deltaChip(
      "Active time",
      signedMinutes(data.delta.total_active_minutes),
      data.delta.total_active_minutes,
      data.delta_percent.total_active_minutes,
    ),
  );
  deltaRow.append(
    deltaChip(
      "Sessions",
      signedNumber(data.delta.session_count),
      data.delta.session_count,
      data.delta_percent.session_count,
    ),
  );
  deltaRow.append(
    deltaChip(
      "Avg session",
      data.delta.average_session_minutes === null
        ? "—"
        : signedMinutes(data.delta.average_session_minutes),
      data.delta.average_session_minutes,
      data.delta_percent.average_session_minutes,
    ),
  );
  deltaRow.append(
    deltaChip(
      "Active days",
      signedNumber(data.delta.active_days),
      data.delta.active_days,
      data.delta_percent.active_days,
    ),
  );
  root.append(deltaRow);

  if (data.tag_deltas.length > 0) {
    const table = make("table", "tag-table");
    const head = make("thead");
    const headRow = make("tr");
    for (const label of ["Tag", "A", "B", "Δ", "Δ%"]) {
      headRow.append(make("th", "", label));
    }
    head.append(headRow);
    table.append(head);

    const body = make("tbody");
    for (const tag of data.tag_deltas) {
      const row = make("tr");
      const nameCell = make("td");
      const name = make("span", "tag-name");
      const dot = make("span", "tag-dot");
      dot.style.background = tagColor(tag.tag === "(untagged)" ? null : tag.tag);
      name.append(dot, make("span", "", tag.tag));
      nameCell.append(name);
      row.append(nameCell);
      row.append(make("td", "", formatDuration(tag.a_minutes)));
      row.append(make("td", "", formatDuration(tag.b_minutes)));
      row.append(make("td", "", signedMinutes(tag.delta_minutes)));
      row.append(
        make(
          "td",
          "",
          tag.delta_percent === null
            ? "—"
            : signedPercent(tag.delta_percent),
        ),
      );
      body.append(row);
    }
    table.append(body);
    root.append(table);
  }

  if (data.truncated.a || data.truncated.b) {
    root.append(
      make(
        "p",
        "footnote",
        "One or both periods hit the session cap; totals may be incomplete.",
      ),
    );
  }
  root.append(
    make(
      "p",
      "footnote",
      "Running sessions are included up to the current instant.",
    ),
  );
}

function periodCard(title: string, period: PeriodStats): HTMLElement {
  const card = make("section", "period-card");
  card.append(make("h2", "period-title", title));
  card.append(
    make("p", "period-range", formatRange(period.from, period.to)),
  );
  const rows: Array<[string, string]> = [
    ["Active time", formatDuration(period.total_active_minutes)],
    ["Sessions", `${period.session_count} (${period.completed_session_count} completed)`],
    [
      "Avg session",
      period.average_session_minutes === null
        ? "—"
        : formatDuration(period.average_session_minutes),
    ],
    [
      "Longest",
      period.longest_session_minutes === null
        ? "—"
        : formatDuration(period.longest_session_minutes),
    ],
    ["Active days", String(period.active_days)],
    ["Running", String(period.running_session_count)],
  ];

  for (const [label, value] of rows) {
    const row = make("div", "period-stat");
    row.append(make("span", "", label));
    row.append(make("strong", "", value));
    card.append(row);
  }

  return card;
}

function deltaChip(
  label: string,
  value: string,
  raw: number | null,
  percent: number | null,
): HTMLElement {
  const chip = make(
    "span",
    `delta-chip${raw && raw > 0 ? " is-positive" : raw && raw < 0 ? " is-negative" : ""}`,
  );
  chip.append(make("span", "", label));
  chip.append(
    make(
      "strong",
      "",
      `${value}${percent === null ? "" : ` · ${signedPercent(percent)}`}`,
    ),
  );
  return chip;
}

function signedMinutes(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatDuration(Math.abs(value))}`;
}

function signedNumber(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
}

function signedPercent(value: number): string {
  return value > 0
    ? `+${value.toFixed(1)}%`
    : value < 0
      ? `−${Math.abs(value).toFixed(1)}%`
      : "0.0%";
}

function renderLoading(): void {
  clear(root);
  root.append(sectionHeader("Period comparison", "A vs B / IST", "Loading…"));
  const loading = make("div", "empty");
  loading.append(make("h2", "empty-title", "Reading sessions…"));
  root.append(loading);
}

renderLoading();
bootApp("Worklog Period Comparison", (result) => {
  if (result.isError) {
    showError(root, "The comparison could not be loaded.", firstText(result));
    return;
  }

  const data = readStructured<ComparisonData>(result);
  if (!data) {
    showError(root, "No structured comparison was returned.");
    return;
  }

  render(data);
});

function firstText(result: { content?: Array<{ type: string; text?: string }> }): string {
  const first = result.content?.find((item) => item.type === "text");
  return first?.text ?? "Try again.";
}
