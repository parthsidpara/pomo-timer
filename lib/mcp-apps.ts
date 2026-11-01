import fs from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";

type AppResource = {
  uri: string;
  file: string;
  title: string;
  description: string;
};

export const APP_RESOURCES = {
  summary: {
    uri: "ui://timer/summary.html",
    file: "summary.html",
    title: "Daily summary chart",
    description: "Stacked daily active time by tag.",
  },
  currentSession: {
    uri: "ui://timer/current-session.html",
    file: "current.html",
    title: "Current session",
    description: "Live elapsed time for the running or paused session.",
  },
  hourly: {
    uri: "ui://timer/hourly.html",
    file: "hourly.html",
    title: "Hourly heatmap",
    description: "Weekday by hour active-time heatmap in IST.",
  },
  gaps: {
    uri: "ui://timer/gaps.html",
    file: "gaps.html",
    title: "Gap timeline",
    description: "Session timeline with gaps and day spans.",
  },
  compare: {
    uri: "ui://timer/compare.html",
    file: "compare.html",
    title: "Period comparison",
    description: "Side-by-side period totals and tag deltas.",
  },
} as const satisfies Record<string, AppResource>;

const htmlCache = new Map<string, Promise<string>>();

export function loadAppHtml(file: string): Promise<string> {
  const cached = htmlCache.get(file);
  if (cached) {
    return cached;
  }

  const promise = fs
    .readFile(path.join(process.cwd(), "mcp-apps", "dist", file), "utf8")
    .catch((error: unknown) => {
      htmlCache.delete(file);
      throw error;
    });

  htmlCache.set(file, promise);
  return promise;
}

export function registerAppResources(
  server: Pick<McpServer, "registerResource">,
): void {
  for (const resource of Object.values(APP_RESOURCES)) {
    registerAppResource(
      server,
      resource.title,
      resource.uri,
      {
        description: resource.description,
        mimeType: RESOURCE_MIME_TYPE,
      },
      async () => ({
        contents: [
          {
            uri: resource.uri,
            mimeType: RESOURCE_MIME_TYPE,
            text: await loadAppHtml(resource.file),
          },
        ],
      }),
    );
  }
}
