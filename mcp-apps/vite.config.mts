import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const INPUT = process.env.INPUT;

if (!INPUT) {
  throw new Error("INPUT environment variable is not set");
}

export default defineConfig({
  root: ROOT,
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: process.env.EMPTY_OUT_DIR === "true",
    target: "es2022",
    rollupOptions: {
      input: path.resolve(ROOT, INPUT),
    },
  },
});
