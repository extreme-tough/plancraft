import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/property/**/*.test.ts", "tests/contract/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**/*.ts"],
      reporter: ["text-summary", "lcov"],
      // ENG-07: the pure domain module carries the invariants, so it carries the coverage gate.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
