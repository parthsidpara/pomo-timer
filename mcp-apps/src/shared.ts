import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/client";

export const IST_TIME_ZONE = "Asia/Kolkata";

const weekdayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  weekday: "short",
});

const dayMonthFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  day: "numeric",
  month: "short",
});

const dateHeadingFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "short",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const TAG_COLORS = [
  "#4f8f7a",
  "#6b7fd7",
  "#c47f3e",
  "#a45c8a",
  "#4e8fbf",
  "#8a8f4e",
  "#b55c5c",
  "#5f9e63",
  "#8b6bb5",
  "#b08a4a",
  "#3f8f9f",
  "#a35f5f",
  "#6f7f3f",
  "#7a5f9f",
  "#4f9f6f",
  "#9f6f4f",
];

export function appRoot(): HTMLElement {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("Missing #app root");
  }
  return root;
}

export function bootApp(
  name: string,
  onResult: (result: CallToolResult) => void,
  hooks: { onTeardown?: () => void | Promise<void> } = {},
): App {
  const app = new App({ name, version: "1.0.0" });

  app.onhostcontextchanged = (context) => {
    applyHostContext(context);
  };

  app.ontoolresult = (result) => {
    onResult(result as unknown as CallToolResult);
  };

  app.onteardown = async () => {
    await hooks.onTeardown?.();
    return {};
  };

  app.connect().then(
    () => applyHostContext(app.getHostContext()),
    (error: unknown) => {
      console.error("MCP App connection failed", error);
      showError(
        appRoot(),
        "Could not connect to the host.",
        "Open this view from an MCP Apps-capable client.",
      );
    },
  );

  return app;
}

function applyHostContext(context: McpUiHostContext | undefined): void {
  if (!context) {
    return;
  }

  if (context.theme) {
    applyDocumentTheme(context.theme);
  }
  if (context.styles?.variables) {
    applyHostStyleVariables(context.styles.variables);
  }
  if (context.styles?.css?.fonts) {
    applyHostFonts(context.styles.css.fonts);
  }

  const root = document.documentElement;
  root.style.setProperty(
    "--safe-top",
    `${context.safeAreaInsets?.top ?? 0}px`,
  );
  root.style.setProperty(
    "--safe-right",
    `${context.safeAreaInsets?.right ?? 0}px`,
  );
  root.style.setProperty(
    "--safe-bottom",
    `${context.safeAreaInsets?.bottom ?? 0}px`,
  );
  root.style.setProperty(
    "--safe-left",
    `${context.safeAreaInsets?.left ?? 0}px`,
  );
}

export function readStructured<T>(result: CallToolResult): T | undefined {
  const value = result.structuredContent;
  return value && typeof value === "object"
    ? (value as T)
    : undefined;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

export function svg(
  tag: keyof SVGElementTagNameMap,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[typeof tag] {
  const element = document.createElementNS(
    "http://www.w3.org/2000/svg",
    tag,
  );
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : timeFormatter.format(date);
}

export function formatRange(fromIso: string, toIso: string): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return "";
  }
  const fromLabel = dayMonthFormatter.format(from);
  const toLabel = dayMonthFormatter.format(to);
  return fromLabel === toLabel ? fromLabel : `${fromLabel} – ${toLabel}`;
}

export function weekdayShort(key: string): string {
  return weekdayFormatter.format(istDate(key));
}

export function dayMonth(key: string): string {
  return dayMonthFormatter.format(istDate(key));
}

export function dateHeading(key: string): string {
  return dateHeadingFormatter.format(istDate(key));
}

export function istDateKey(iso: string): string {
  return dateKeyFormatter.format(new Date(iso));
}

export function tagColor(tag: string | null): string {
  if (!tag) {
    return "#8b949e";
  }

  let hash = 2166136261;
  for (const character of tag) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return TAG_COLORS[(hash >>> 0) % TAG_COLORS.length];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function showError(
  root: HTMLElement,
  title: string,
  detail?: string,
): void {
  clear(root);
  const panel = make("section", "empty");
  panel.append(make("h2", "empty-title", title));
  if (detail) {
    panel.append(make("p", "empty-copy", detail));
  }
  root.append(panel);
}

export function emptyState(root: HTMLElement, message: string): void {
  clear(root);
  const panel = make("section", "empty");
  panel.append(make("h2", "empty-title", message));
  root.append(panel);
}

export function sectionHeader(
  title: string,
  subtitle: string,
  meta?: string,
): HTMLElement {
  const header = make("header", "view-head");
  const copy = make("div");
  copy.append(make("p", "eyebrow", subtitle));
  copy.append(make("h1", "view-title", title));
  header.append(copy);
  if (meta) {
    header.append(make("p", "view-meta", meta));
  }
  return header;
}

export function metric(label: string, value: string): HTMLElement {
  const item = make("div", "metric");
  item.append(make("span", "metric-label", label));
  item.append(make("strong", "metric-value", value));
  return item;
}

export function legendItem(tag: string, color: string): HTMLElement {
  const item = make("span", "legend-item");
  const swatch = make("span", "legend-swatch");
  swatch.style.background = color;
  item.append(swatch, make("span", "legend-label", tag));
  return item;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function istDate(key: string): Date {
  return new Date(`${key}T12:00:00+05:30`);
}
