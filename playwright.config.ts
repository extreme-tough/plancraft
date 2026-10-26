import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * Runs inside `firebase emulators:exec` (pnpm test:e2e), so Auth and Firestore are local emulators.
 * In CI the app is built in an earlier step (E2E_PREBUILT=1); locally the web server builds it.
 */
const testEnv = {
  APP_ENV: "test",
  AI_PROVIDER: "fixture",
  NEXT_PUBLIC_FIREBASE_EMULATORS: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  // Every test signs in from the same local IP; the production limit is 20 a minute.
  DEMO_SESSION_LIMIT_PER_MINUTE: "1000",
};

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // Auth round-trips through the emulators (sign-in, popup hand-back) take a few seconds under load.
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // More than two browsers at once overloads the local Firebase emulators and makes auth flows
  // flaky (Firestore channels stall); two is also what CI's runners get by default.
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    // UX-12: the smallest supported width.
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 740 } } },
  ],
  webServer: {
    command: process.env.E2E_PREBUILT ? `pnpm start --port ${PORT}` : `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/welcome`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: testEnv,
  },
});
