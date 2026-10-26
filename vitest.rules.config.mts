import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Firestore security-rules and emulator integration tests; run inside `firebase emulators:exec` (pnpm test:rules).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
