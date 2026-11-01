import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONFIG = path.join(ROOT, "mcp-apps", "vite.config.mts");
const DIST = path.join(ROOT, "mcp-apps", "dist");
const VIEWS = ["summary", "current", "hourly", "gaps", "compare"];

for (let index = 0; index < VIEWS.length; index += 1) {
  const view = VIEWS[index];
  process.env.INPUT = `${view}.html`;
  process.env.EMPTY_OUT_DIR = index === 0 ? "true" : "false";

  await build({
    configFile: CONFIG,
    logLevel: "warn",
  });
}

for (const view of VIEWS) {
  const file = path.join(DIST, `${view}.html`);
  let html;
  try {
    html = await fs.readFile(file, "utf8");
  } catch {
    throw new Error(`Missing built view: ${file}`);
  }

  if (/<script[^>]+\bsrc\s*=/i.test(html)) {
    throw new Error(`${view}.html still references an external script`);
  }
  if (/<link[^>]+\bhref\s*=\s*["']https?:/i.test(html)) {
    throw new Error(`${view}.html still references an external stylesheet`);
  }
  if (/@import\s+url\(\s*["']?https?:/i.test(html)) {
    throw new Error(`${view}.html still imports an external resource`);
  }

  console.log(
    `[mcp-apps] ${view}.html ${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB`,
  );
}
