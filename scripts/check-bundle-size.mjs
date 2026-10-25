// ENG-11: the JavaScript a first page load needs must stay under 250 KB gzipped.
// Run after `pnpm build`. Measures the shared root chunks plus each app route's own chunks.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const LIMIT_BYTES = 250 * 1024;
const NEXT_DIR = ".next";

const build = JSON.parse(readFileSync(join(NEXT_DIR, "build-manifest.json"), "utf8"));
const app = JSON.parse(readFileSync(join(NEXT_DIR, "app-build-manifest.json"), "utf8"));

const gzipCache = new Map();
const gzipped = (file) => {
  if (!gzipCache.has(file)) gzipCache.set(file, gzipSync(readFileSync(join(NEXT_DIR, file))).length);
  return gzipCache.get(file);
};

// Polyfills are served with `nomodule`, so modern browsers never download them.
const shared = (build.rootMainFiles ?? []).filter((f) => f.endsWith(".js"));
let failed = false;

for (const [route, files] of Object.entries(app.pages)) {
  if (!route.endsWith("/page")) continue;
  const all = new Set([...shared, ...files.filter((f) => f.endsWith(".js"))]);
  const total = [...all].reduce((sum, file) => sum + gzipped(file), 0);
  const kb = (total / 1024).toFixed(1);
  const ok = total <= LIMIT_BYTES;
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${route.padEnd(40)} ${kb} KB gzipped`);
}

if (failed) {
  console.error(`At least one route exceeds ${LIMIT_BYTES / 1024} KB of gzipped JavaScript.`);
  process.exit(1);
}
