import "./base.css";
import type { App } from "@modelcontextprotocol/ext-apps";
import {
  appRoot,
  bootApp,
  clear,
  formatClock,
  formatTime,
  make,
  readStructured,
  sectionHeader,
  showError,
} from "./shared";

type SerializedSession = {
  id: string;
  label: string;
  tag: string | null;
  start: string;
  end: string | null;
  active_minutes: number;
  paused_minutes: number;
  active_seconds: number;
  paused: boolean;
};

type CurrentData = {
  server_time: string;
  session: SerializedSession | null;
};

const root = appRoot();
let app: App | null = null;
let pollTimer: number | null = null;
let clockEl: HTMLElement | null = null;
let baseSeconds = 0;
let baseAt = performance.now();
let paused = true;
let hasSession = false;

function render(data: CurrentData): void {
  clear(root);

  const session = data.session;
  hasSession = Boolean(session);
  paused = session?.paused ?? true;
  baseSeconds = session?.active_seconds ?? 0;
  baseAt = performance.now();

  const header = sectionHeader(
    "Current session",
    "Live / IST",
    session ? `Updated ${formatTime(data.server_time)}` : "Idle",
  );
  root.append(header);

  const card = make("section", "current-card");
  const status = make(
    "span",
    `pill ${session ? (session.paused ? "is-paused" : "is-running") : "is-idle"}`,
  );
  status.append(make("span", "status-dot"));
  status.append(
    make(
      "span",
      "",
      session ? (session.paused ? "Paused" : "Running") : "Idle",
    ),
  );
  card.append(status);

  const title = make(
    "h2",
    "current-title",
    session?.label ? session.label : session ? "Untitled session" : "No session running",
  );
  card.append(title);

  if (session?.tag) {
    card.append(make("span", "current-tag", session.tag));
  }

  clockEl = make("div", "current-clock", formatClock(baseSeconds));
  clockEl.setAttribute("role", "timer");
  card.append(clockEl);

  if (session) {
    const meta = make("div", "current-meta");
    const pausedText = session.paused
      ? "Paused now"
      : session.paused_minutes >= 1
        ? `${formatClock(session.paused_minutes * 60)} paused`
        : "No pauses";
    meta.textContent = `Started ${formatTime(session.start)} IST · ${pausedText}`;
    card.append(meta);
  } else {
    card.append(
      make(
        "div",
        "current-meta",
        "Start a session from the timer screen or ask Claude to start one.",
      ),
    );
  }

  const connection = make("div", "current-connection");
  connection.id = "connection";
  card.append(connection);

  root.append(card);

  tick();
}

function tick(): void {
  if (!clockEl) {
    return;
  }

  const elapsed = hasSession && !paused
    ? baseSeconds + (performance.now() - baseAt) / 1000
    : baseSeconds;
  clockEl.textContent = formatClock(elapsed);
}

function startPolling(): void {
  if (pollTimer !== null || !app) {
    return;
  }

  void poll();
  pollTimer = window.setInterval(() => {
    void poll();
  }, 5000);
}

async function poll(): Promise<void> {
  if (!app) {
    return;
  }

  try {
    const result = await app.callServerTool({
      name: "poll_current_session",
      arguments: {},
    });
    if (result.isError) {
      setConnection("Live updates are unavailable.");
      return;
    }

    const data = readStructured<CurrentData>(result);
    if (data) {
      render(data);
      setConnection("Live · updates every 5s");
    }
  } catch (error) {
    console.error("Current session poll failed", error);
    setConnection("Reconnecting…");
  }
}

function setConnection(message: string): void {
  const element = document.getElementById("connection");
  if (element) {
    element.textContent = message;
  }
}

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

window.setInterval(tick, 1000);

app = bootApp(
  "Worklog Current Session",
  (result) => {
    if (result.isError) {
      showError(root, "The current session could not be loaded.", firstText(result));
      return;
    }

    const data = readStructured<CurrentData>(result);
    if (!data) {
      showError(root, "No structured current-session payload was returned.");
      return;
    }

    render(data);
    startPolling();
  },
  { onTeardown: stopPolling },
);

function firstText(result: { content?: Array<{ type: string; text?: string }> }): string {
  const first = result.content?.find((item) => item.type === "text");
  return first?.text ?? "Try again.";
}
