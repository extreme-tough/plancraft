import { defineConfig } from "vitest/config";

// Firestore and Storage security-rules tests; run inside `firebase emulators:exec` (pnpm test:rules).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
