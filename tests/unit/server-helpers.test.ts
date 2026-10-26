import { describe, expect, it } from "vitest";
import { MemoryEventRepository } from "@/data/memory-repository";
import { VersionConflictError } from "@/data/repository";
import { isDemoUid } from "@/lib/demo";
import { clientIp } from "@/server/client-ip";
import { parseServerEnv } from "@/server/env";
import { isCrossSite, jsonError, jsonOk } from "@/server/http";
import { counterId, DAY_SECONDS, istDay, windowStart } from "@/server/rate-limit";
import { buildCsp } from "@/server/security/csp";
import { makePlan } from "../support/factories";

describe("clientIp (ENG-08)", () => {
  const headers = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});

  it("takes the entry the trusted proxies appended, never a forged one", () => {
    expect(clientIp(headers("6.6.6.6, 203.0.113.9, 10.0.0.1"), 2)).toBe("203.0.113.9");
    expect(clientIp(headers("203.0.113.9"), 1)).toBe("203.0.113.9");
    expect(clientIp(headers("2001:db8::1, 10.0.0.1"), 2)).toBe("2001:db8::1");
  });

  it("returns null when the header is missing, too short or not an IP", () => {
    expect(clientIp(headers(), 2)).toBeNull();
    expect(clientIp(headers("10.0.0.1"), 2)).toBeNull();
    expect(clientIp(headers("<script>, 10.0.0.1"), 2)).toBeNull();
    expect(clientIp(headers("1.2.3.4"), 0)).toBeNull();
  });
});

describe("rate-limit windows", () => {
  it("rolls the day over at midnight IST, not UTC", () => {
    expect(istDay(new Date("2026-10-26T18:29:59Z"))).toBe("2026-10-26");
    expect(istDay(new Date("2026-10-26T18:30:00Z"))).toBe("2026-10-27");
  });

  it("starts daily windows at midnight IST and minute windows on the minute", () => {
    const now = new Date("2026-10-26T20:00:00Z");
    expect(new Date(windowStart(now, DAY_SECONDS)).toISOString()).toBe("2026-10-26T18:30:00.000Z");
    expect(new Date(windowStart(new Date("2026-10-26T20:00:42Z"), 60)).toISOString()).toBe("2026-10-26T20:00:00.000Z");
  });

  it("gives each key and window its own counter, without exposing the key", () => {
    const rule = { key: "ai:user:alice", limit: 10, windowSeconds: 60 };
    const a = counterId(rule, new Date("2026-10-26T20:00:01Z"));
    expect(a).toBe(counterId(rule, new Date("2026-10-26T20:00:59Z")));
    expect(a).not.toBe(counterId(rule, new Date("2026-10-26T20:01:00Z")));
    expect(a).not.toBe(counterId({ ...rule, key: "ai:user:bob" }, new Date("2026-10-26T20:00:01Z")));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("HTTP envelopes", () => {
  it("wraps data and errors, never cached", async () => {
    const ok = jsonOk({ token: "t" });
    expect(await ok.json()).toEqual({ ok: true, data: { token: "t" } });
    expect(ok.headers.get("cache-control")).toBe("no-store");

    const error = jsonError(429, "RATE_LIMITED", "Wait", { retryable: true, retryAfterSeconds: 30 });
    expect(error.status).toBe(429);
    expect(error.headers.get("retry-after")).toBe("30");
    expect(await error.json()).toEqual({ ok: false, error: { code: "RATE_LIMITED", message: "Wait", retryable: true } });
  });

  it("treats only other sites as cross-site", () => {
    const req = (site?: string) => new Request("https://app.test/api", { headers: site ? { "sec-fetch-site": site } : {} });
    expect(isCrossSite(req("same-origin"))).toBe(false);
    expect(isCrossSite(req())).toBe(false);
    expect(isCrossSite(req("cross-site"))).toBe(true);
    expect(isCrossSite(req("same-site"))).toBe(true);
  });
});

describe("environment guards", () => {
  it("refuses emulators in production (EM-59)", () => {
    expect(() => parseServerEnv({ APP_ENV: "production", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" })).toThrow(/EM-59/);
    expect(() => parseServerEnv({ APP_ENV: "production", NEXT_PUBLIC_FIREBASE_EMULATORS: "1" })).toThrow(/EM-59/);
    expect(parseServerEnv({ APP_ENV: "test", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }).usesEmulators).toBe(true);
  });

  it("allows the emulator origins in the CSP only when asked", () => {
    expect(buildCsp({ nonce: "n", isDev: false })).not.toContain("127.0.0.1");
    const csp = buildCsp({ nonce: "n", isDev: false, emulators: true });
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("http://127.0.0.1:8080");
    expect(csp).toMatch(/frame-src http:\/\/127\.0\.0\.1:9099/);
  });
});

describe("demo account", () => {
  it("is recognised by its fixed uid only", () => {
    expect(isDemoUid("demo-shared")).toBe(true);
    expect(isDemoUid("demo-shared-2")).toBe(false);
    expect(isDemoUid(null)).toBe(false);
  });
});

describe("MemoryEventRepository (same contract as Firestore)", () => {
  it("version-checks saves and hands back the latest plan on conflict (EM-62)", async () => {
    const repo = new MemoryEventRepository();
    const created = await repo.createEvent(makePlan({ version: 9 }));
    expect(created.version).toBe(0);
    await repo.saveEvent({ ...created, occasion: "First" }, 0);
    const conflict = await repo.saveEvent({ ...created, occasion: "Second" }, 0).catch((e: unknown) => e);
    expect(conflict).toBeInstanceOf(VersionConflictError);
    expect((conflict as VersionConflictError).latest.occasion).toBe("First");
  });

  it("notifies subscribers and stops after unsubscribe", async () => {
    const repo = new MemoryEventRepository();
    const seen: Array<string | null> = [];
    const stop = repo.subscribeEvent("event-1", (plan) => seen.push(plan?.occasion ?? null));
    const created = await repo.createEvent(makePlan());
    await repo.saveEvent({ ...created, occasion: "Changed" }, 0);
    stop();
    await repo.deleteEvent("event-1");
    expect(seen).toEqual([null, created.occasion, "Changed"]);
  });

  it("keeps proposals apart from the plan", async () => {
    const repo = new MemoryEventRepository();
    await repo.createEvent(makePlan());
    await repo.saveProposal({
      id: "p1", eventId: "event-1", kind: "scenario", name: "No band", baseVersion: 0, changes: [], requestText: null,
      deterministicOps: [], options: [], interpretation: null, assumptions: [], selectedOption: null,
    });
    expect((await repo.getEvent("event-1"))?.version).toBe(0);
    expect((await repo.getProposal("event-1", "p1"))?.name).toBe("No band");
    await repo.deleteProposal("event-1", "p1");
    expect(await repo.listProposals("event-1")).toEqual([]);
  });
});
