// EM-63: `pnpm demo:reset` runs the nightly Cloud Scheduler job now (before recording the video
// and before submitting), then waits for its result. The job itself calls the app's reset route.
//
// Credentials, in order: $GOOGLE_OAUTH_ACCESS_TOKEN, `gcloud auth print-access-token`, or the
// Firebase CLI's own login (`firebase login`). Nothing is printed but statuses.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? "plant-care-copilot";
const LOCATION = process.env.DEMO_RESET_LOCATION ?? "asia-southeast1";
const JOB = `projects/${PROJECT}/locations/${LOCATION}/jobs/plancraft-demo-reset`;
const API = "https://cloudscheduler.googleapis.com/v1";
const APP = process.env.DEMO_URL ?? "https://plancraft--plant-care-copilot.asia-southeast1.hosted.app";

async function accessToken() {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  try {
    return execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], shell: process.platform === "win32" }).trim();
  } catch {
    // Fall through to the Firebase CLI login.
  }
  const require = createRequire(import.meta.url);
  const tools = path.dirname(require.resolve("firebase-tools/package.json"));
  const auth = require(path.join(tools, "lib/auth"));
  const { configstore } = require(path.join(tools, "lib/configstore"));
  const refresh = configstore.get("tokens")?.refresh_token;
  if (!refresh) throw new Error("No Google credentials: run `firebase login` or `gcloud auth login`.");
  return (await auth.getAccessToken(refresh, [])).access_token;
}

const token = await accessToken();
const call = async (url, method = "GET") => {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "x-goog-user-project": PROJECT } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${url} → ${response.status} ${body.error?.message ?? ""}`);
  return body;
};

// The app records each reset; a record newer than this run is its result.
const started = new Date().toISOString();
await call(`${API}/${JOB}:run`, "POST");
console.log("Demo reset started. Waiting for the result (up to 6 minutes)…");

for (let i = 0; i < 36; i++) {
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  const status = await fetch(`${APP}/api/demo/status`).then((r) => r.json()).catch(() => null);
  const { lastResetAt, outcome } = status?.data ?? {};
  if (typeof lastResetAt === "string" && lastResetAt >= started) {
    console.log(outcome === "ok" ? `Demo reset at ${lastResetAt}.` : `Demo reset at ${lastResetAt} without a plan; Cloud Scheduler retries it 3 times, 5 minutes apart.`);
    process.exit(outcome === "ok" ? 0 : 1);
  }
}
console.log("No result yet. Check the job in Cloud Scheduler and the app's logs.");
process.exit(1);
