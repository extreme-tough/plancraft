import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { planRequestFor } from "@/domain/plan-build";
import { DEMO_UID } from "@/lib/demo";
import {
  aiLimitRules,
  DAILY_LIMIT_MESSAGE,
  MAX_BODY_BYTES,
  runAiCall,
  type Caller,
  type PipelineDeps,
} from "@/server/ai/pipeline";
import { createProvider } from "@/server/ai/providers";
import { PLAN_CALL } from "@/server/ai/schemas/plan";
import { parseServerEnv } from "@/server/env";
import { DAY_SECONDS, type LimitResult } from "@/server/rate-limit";
import { verifyBearer } from "@/server/verify-token";
import { makePlan } from "../support/factories";
import { ScriptedProvider } from "../support/scripted-provider";

const FIXTURE = readFileSync("tests/fixtures/ai/plan/valid.json", "utf8");
const NOW = new Date("2026-10-26T06:00:00Z");
const BODY = planRequestFor(makePlan({ description: "SECRET-USER-TEXT" }), "2026-10-26");

function deps(overrides: Partial<PipelineDeps> = {}): PipelineDeps & { logs: Record<string, unknown>[] } {
  const logs: Record<string, unknown>[] = [];
  return {
    verifyToken: async (header) => (header === "Bearer good" ? { uid: "user-1", isDemo: false } : null),
    consume: async (): Promise<LimitResult> => ({ ok: true }),
    provider: new ScriptedProvider([FIXTURE]),
    clientIp: "203.0.113.9",
    limits: { dailyCap: 2000 },
    now: () => NOW,
    log: (entry) => logs.push(entry),
    logs,
    ...overrides,
  };
}

function post(body: unknown = BODY, token: string | null = "good"): Request {
  return new Request("http://localhost/api/ai/plan", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function envelope(response: Response): Promise<{ ok: boolean; data?: unknown; meta?: unknown; error?: { code: string; retryable: boolean } }> {
  return response.json() as Promise<{ ok: boolean; error?: { code: string; retryable: boolean } }>;
}

describe("runAiCall: success (spec §7.2.9)", () => {
  it("returns the validated plan with attempts and model in meta", async () => {
    const response = await runAiCall(post(), PLAN_CALL, deps());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await envelope(response);
    expect(body).toMatchObject({ ok: true, meta: { attempts: 1, model: "scripted" } });
    expect(body.data).toMatchObject({ budgetLines: expect.any(Array), tasks: expect.any(Array) });
  });

  it("never logs user text or AI text, only outcomes and rule IDs (spec §7.2.11)", async () => {
    const d = deps({ provider: new ScriptedProvider(["not json", FIXTURE]) });
    await runAiCall(post(), PLAN_CALL, d);
    const logged = JSON.stringify(d.logs);
    expect(d.logs).toEqual([expect.objectContaining({ call: "plan", outcome: "ok", attempts: 2 })]);
    expect(logged).not.toContain("SECRET-USER-TEXT");
    expect(logged).not.toContain("Venue hire");
  });
});

describe("runAiCall: refusals before the model is called", () => {
  it.each([[null], ["bad"]])("401 UNAUTHENTICATED for token %s", async (token) => {
    const provider = new ScriptedProvider([]);
    const response = await runAiCall(post(BODY, token), PLAN_CALL, deps({ provider }));
    expect(response.status).toBe(401);
    expect((await envelope(response)).error).toMatchObject({ code: "UNAUTHENTICATED", retryable: false });
    expect(provider.requests).toHaveLength(0);
  });

  it("429 RATE_LIMITED with Retry-After for a per-caller limit", async () => {
    const consume = async (): Promise<LimitResult> => ({ ok: false, rule: { key: "ai:user:user-1", limit: 10, windowSeconds: 60 }, retryAfterSeconds: 42 });
    const response = await runAiCall(post(), PLAN_CALL, deps({ consume }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect((await envelope(response)).error).toMatchObject({ code: "RATE_LIMITED", retryable: true });
  });

  it.each(["ai:all", "ai:demo-total"])("429 DAILY_LIMIT_REACHED with the friendly message when %s is used up (spec §7.6)", async (key) => {
    const consume = async (): Promise<LimitResult> => ({ ok: false, rule: { key, limit: 1, windowSeconds: DAY_SECONDS }, retryAfterSeconds: 3600 });
    const response = await runAiCall(post(), PLAN_CALL, deps({ consume }));
    expect(response.status).toBe(429);
    expect(await envelope(response)).toMatchObject({ ok: false, error: { code: "DAILY_LIMIT_REACHED", message: DAILY_LIMIT_MESSAGE, retryable: false } });
  });

  it.each<[string, unknown]>([
    ["not JSON", "{"],
    ["a missing field", { ...BODY, currency: undefined }],
    ["an extra field", { ...BODY, lines: [] }],
    ["a past event", { ...BODY, eventDate: "2026-10-01" }],
    ["a device date far from the server's", { ...BODY, today: "2026-10-20", eventDate: "2026-11-30" }],
    ["an oversized body", { ...BODY, description: "x".repeat(MAX_BODY_BYTES) }],
  ])("400 INVALID_REQUEST for %s, and the model is never called", async (_name, body) => {
    const provider = new ScriptedProvider([]);
    const response = await runAiCall(post(body), PLAN_CALL, deps({ provider }));
    expect(response.status).toBe(400);
    expect((await envelope(response)).error).toMatchObject({ code: "INVALID_REQUEST", retryable: false });
    expect(provider.requests).toHaveLength(0);
  });

  it("checks the token before counting a request against the limits", async () => {
    const consume = vi.fn(async (): Promise<LimitResult> => ({ ok: true }));
    await runAiCall(post(BODY, null), PLAN_CALL, deps({ consume }));
    expect(consume).not.toHaveBeenCalled();
  });
});

describe("runAiCall: model failures map to the envelope (spec §7.2.9)", () => {
  it.each([
    ["AI_UNAVAILABLE", 503, true],
    ["AI_TIMEOUT", 504, true],
    ["AI_BLOCKED", 502, false],
  ] as const)("%s → %i", async (code, status, retryable) => {
    const response = await runAiCall(post(), PLAN_CALL, deps({ provider: new ScriptedProvider([{ kind: "error", code }]) }));
    expect(response.status).toBe(status);
    expect((await envelope(response)).error).toMatchObject({ code, retryable });
  });

  it("invalid twice → 502 AI_INVALID_OUTPUT, and the failed rules are logged", async () => {
    const d = deps({ provider: new ScriptedProvider(["{}", "{}"]) });
    const response = await runAiCall(post(), PLAN_CALL, d);
    expect(response.status).toBe(502);
    expect((await envelope(response)).error).toMatchObject({ code: "AI_INVALID_OUTPUT", retryable: true });
    expect(d.logs).toEqual([expect.objectContaining({ outcome: "AI_INVALID_OUTPUT", attempts: 2, rules: ["SCHEMA"] })]);
  });
});

describe("aiLimitRules (ENG-08)", () => {
  const google: Caller = { uid: "u1", isDemo: false };
  const demo: Caller = { uid: DEMO_UID, isDemo: true };

  it("counts Google users per user ID: 10 a minute, 100 a day, plus the global cap", () => {
    expect(aiLimitRules(google, "1.2.3.4", { dailyCap: 2000 })).toEqual([
      { key: "ai:user:u1", limit: 10, windowSeconds: 60 },
      { key: "ai:user:u1", limit: 100, windowSeconds: DAY_SECONDS },
      { key: "ai:all", limit: 2000, windowSeconds: DAY_SECONDS },
    ]);
  });

  it("counts the shared demo per IP (10 a minute, 50 a day) and 1,500 a day in total", () => {
    expect(aiLimitRules(demo, "1.2.3.4", { dailyCap: 7 })).toEqual([
      { key: "ai:demo-ip:1.2.3.4", limit: 10, windowSeconds: 60 },
      { key: "ai:demo-ip:1.2.3.4", limit: 50, windowSeconds: DAY_SECONDS },
      { key: "ai:demo-total", limit: 1500, windowSeconds: DAY_SECONDS },
      { key: "ai:all", limit: 7, windowSeconds: DAY_SECONDS },
    ]);
  });
});

describe("verifyBearer (spec §7.2.1)", () => {
  const auth = {
    verifyIdToken: vi.fn(async (token: string) => {
      if (token === "good.token.sig") return { uid: "user-1" };
      if (token === "demo.token.sig") return { uid: DEMO_UID };
      // The Admin SDK rejects expired tokens and tokens issued for another Firebase project.
      throw Object.assign(new Error("rejected"), { code: token.startsWith("expired") ? "auth/id-token-expired" : "auth/argument-error" });
    }),
  } as unknown as Parameters<typeof verifyBearer>[0];

  it("accepts a valid token and recognises the shared demo account by uid", async () => {
    expect(await verifyBearer(auth, "Bearer good.token.sig")).toEqual({ uid: "user-1", isDemo: false });
    expect(await verifyBearer(auth, "Bearer demo.token.sig")).toEqual({ uid: DEMO_UID, isDemo: true });
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["not Bearer", "Basic good.token.sig"],
    ["expired", "Bearer expired.token.sig"],
    ["from another project", "Bearer other-project.token.sig"],
  ])("rejects a %s token", async (_name, header) => {
    expect(await verifyBearer(auth, header)).toBeNull();
  });
});

describe("createProvider (AI-05)", () => {
  it("refuses the fixture provider in production", () => {
    const env = { ...parseServerEnv({ AI_PROVIDER: "fixture", APP_ENV: "test" }), appEnv: "production" as const };
    expect(() => createProvider(env)).toThrow(/AI-05/);
  });

  it("uses the fixture provider for test deployments and Vertex AI otherwise", () => {
    expect(createProvider(parseServerEnv({ AI_PROVIDER: "fixture", APP_ENV: "test" })).model).toBe("fixture");
    const vertex = createProvider(parseServerEnv({ AI_PROVIDER: "vertex", GOOGLE_CLOUD_PROJECT: "demo-project" }));
    expect(vertex.model).toBe("gemini-3.8-flash");
  });
});
