import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { parseServerEnv } from "@/server/env";

describe("parseServerEnv", () => {
  it("applies safe defaults", () => {
    const env = parseServerEnv({});
    expect(env.AI_PROVIDER).toBe("vertex");
    expect(env.AI_DAILY_CAP).toBe(2000);
    expect(env.appEnv).toBe("development");
  });

  it("refuses the fixture AI provider in production (AI-05)", () => {
    expect(() => parseServerEnv({ APP_ENV: "production", AI_PROVIDER: "fixture" })).toThrow(/AI-05/);
    expect(() => parseServerEnv({ NODE_ENV: "production", AI_PROVIDER: "fixture" })).toThrow(/AI-05/);
  });

  it("allows the fixture provider for a production build run as a test deployment", () => {
    const env = parseServerEnv({ NODE_ENV: "production", APP_ENV: "test", AI_PROVIDER: "fixture" });
    expect(env.appEnv).toBe("test");
  });

  it("treats blank values as unset, so .env.example works as copied", () => {
    const env = parseServerEnv({ GOOGLE_CLOUD_PROJECT: "", GEMINI_MODEL: "  ", AI_DAILY_CAP: "" });
    expect(env.GOOGLE_CLOUD_PROJECT).toBeUndefined();
    expect(env.GEMINI_MODEL).toBe("gemini-2.5-flash");
    expect(env.AI_DAILY_CAP).toBe(2000);
  });

  it("rejects a non-numeric daily cap", () => {
    expect(() => parseServerEnv({ AI_DAILY_CAP: "lots" })).toThrow(/AI_DAILY_CAP/);
  });
});

describe("apphosting.yaml (the live deployment)", () => {
  const config = parse(readFileSync("apphosting.yaml", "utf8")) as {
    env: Array<{ variable: string; value?: string; secret?: string }>;
  };
  const vars = new Map(config.env.map((entry) => [entry.variable, entry.value]));

  it("declares itself production and uses the real AI provider", () => {
    expect(vars.get("APP_ENV")).toBe("production");
    expect(vars.get("AI_PROVIDER")).toBe("vertex");
  });

  it("parses as a valid production environment", () => {
    expect(() => parseServerEnv(Object.fromEntries(vars))).not.toThrow();
  });

  it("holds no secrets in plain values (ENG-02)", () => {
    // NEXT_PUBLIC_* values ship to every browser (the Firebase web config is public by design);
    // anything else named like a credential must come from Secret Manager.
    const suspicious = config.env.filter(
      (entry) =>
        /KEY|SECRET|TOKEN|PASSWORD/i.test(entry.variable) &&
        !entry.variable.startsWith("NEXT_PUBLIC_") &&
        entry.value !== undefined,
    );
    expect(suspicious).toEqual([]);
  });
});
