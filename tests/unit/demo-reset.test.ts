import { exportJWK, generateKeyPair, createLocalJWKSet, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { quoteDetails, type Quote } from "@/domain/quote";
import type { EventPlan } from "@/domain/schemas";
import { firstDemoVisit, openingDemoEvent } from "@/lib/demo-pointer";
import { FixtureProvider } from "@/server/ai/fixture-provider";
import type { AiProvider, ModelRequest } from "@/server/ai/provider";
import { resetDemo, sampleQuoteLine, type DemoStore, type ResetRecord } from "@/server/demo-reset";
import { verifySchedulerToken } from "@/server/verify-oidc";

/** The demo account in memory: events, their quotes, and the reset record. */
function memoryStore(initial: EventPlan[] = []) {
  const events = new Map(initial.map((plan) => [plan.id, plan]));
  const quotes = new Map<string, Quote[]>();
  const records: ResetRecord[] = [];
  const store: DemoStore = {
    eventIds: async () => [...events.keys()],
    deleteEvent: async (id) => {
      events.delete(id);
      quotes.delete(id);
    },
    writeEvent: async (plan) => {
      events.set(plan.id, plan);
    },
    writeQuote: async (eventId, quote) => {
      quotes.set(eventId, [...(quotes.get(eventId) ?? []).filter((q) => q.id !== quote.id), quote]);
    },
    recordReset: async (record) => {
      records.push(record);
    },
  };
  return { store, events, quotes, records };
}

const counter = (): (() => string) => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
};

const NOW = new Date("2026-10-28T21:30:00Z"); // 3:00 AM IST on 29 October

/** Fails every call the way Vertex does when it's down. */
const down: AiProvider = { model: "down", generate: async () => ({ kind: "error", code: "AI_UNAVAILABLE" }) };

/** Answers every call with text that isn't JSON. */
const garbled: AiProvider = { model: "garbled", generate: async () => ({ kind: "ok", text: "not json" }) };

describe("nightly demo reset (EM-63)", () => {
  it("wipes the demo, writes the pinned event from the seed inputs, generates its plan and reads the sample quotes", async () => {
    const { store, events, quotes, records } = memoryStore();
    const first = await resetDemo({ store, provider: new FixtureProvider(), now: NOW, newId: counter() });
    const leftover = events.get(first.eventId) as EventPlan;
    const { store: again, events: after, quotes: afterQuotes, records: log } = memoryStore([leftover, { ...leftover, id: "someone-else", demoPinned: false }]);

    const result = await resetDemo({ store: again, provider: new FixtureProvider(), now: NOW, newId: counter() });
    expect(result).toMatchObject({ outcome: "ok", deleted: 2, failed: [], quotesRead: 3 });
    expect([...after.keys()]).toEqual([result.eventId]);

    const plan = after.get(result.eventId) as EventPlan;
    expect(plan).toMatchObject({ isDemo: true, demoPinned: true, version: 1, occasion: "Ananya & Rohan's wedding", currency: "INR", guestCount: 150 });
    // Seeded ~120 days after the IST date of the run, as "Try an example" would.
    expect(plan.eventDate).toBe("2027-02-26");
    expect(plan.lines.length).toBeGreaterThan(0);
    expect(plan.tasks.length).toBeGreaterThan(0);
    expect(plan.lines.every((line) => line.label === "ai_estimate")).toBe(true);

    const line = sampleQuoteLine(plan);
    expect(line?.category).toBe("catering");
    const stored = afterQuotes.get(plan.id) ?? [];
    expect(stored.map((q) => quoteDetails(q)?.vendorName)).toEqual(["Saffron Table Caterers", "Marwar Kitchen Co.", "Silver Spoon Global Catering"]);
    expect(stored.every((q) => q.lineId === line?.id)).toBe(true);
    expect(log).toEqual([{ at: NOW.toISOString(), outcome: "ok", eventId: plan.id }]);

    // The first store saw the same thing.
    expect(records[0]?.outcome).toBe("ok");
    expect(quotes.get(first.eventId)).toHaveLength(3);
  });

  it("leaves the pinned event without a plan when the AI is down, and records it (spec §7.6)", async () => {
    const { store, events, quotes, records } = memoryStore();
    const result = await resetDemo({ store, provider: down, now: NOW, newId: counter() });
    expect(result).toMatchObject({ outcome: "no_plan", failed: ["AI_UNAVAILABLE"], quotesRead: 0 });
    const plan = events.get(result.eventId) as EventPlan;
    expect(plan).toMatchObject({ demoPinned: true, version: 0, lines: [], tasks: [] });
    expect(quotes.size).toBe(0);
    expect(records).toEqual([{ at: NOW.toISOString(), outcome: "no_plan", eventId: plan.id }]);
  });

  it("uses no output that fails validation: one repair attempt, then no plan", async () => {
    const calls: ModelRequest[] = [];
    const counting: AiProvider = { model: "counting", generate: (request) => (calls.push(request), garbled.generate(request)) };
    const { store, events } = memoryStore();
    const result = await resetDemo({ store, provider: counting, now: NOW, newId: counter() });
    expect(result).toMatchObject({ outcome: "no_plan", failed: ["AI_INVALID_OUTPUT", "JSON"] });
    expect(calls.map((c) => c.call)).toEqual(["plan", "plan"]);
    expect(events.get(result.eventId)?.lines).toEqual([]);
  });

  it("a retry after a failed run replaces the plan-less event (Cloud Scheduler retries on 503)", async () => {
    const { store, events } = memoryStore();
    const failed = await resetDemo({ store, provider: down, now: NOW, newId: counter() });
    const retried = await resetDemo({ store, provider: new FixtureProvider(), now: NOW, newId: () => crypto.randomUUID() });
    expect(retried.outcome).toBe("ok");
    expect(events.has(failed.eventId)).toBe(false);
    expect(events.size).toBe(1);
  });

  it("keeps a sample quote unread when the AI can't read it", async () => {
    const fixtures = new FixtureProvider();
    const planOnly: AiProvider = { model: "plan-only", generate: (request) => (request.call === "plan" ? fixtures.generate(request) : down.generate(request)) };
    const { store, quotes } = memoryStore();
    const result = await resetDemo({ store, provider: planOnly, now: NOW, newId: counter() });
    expect(result).toMatchObject({ outcome: "ok", quotesRead: 0 });
    expect(quotes.get(result.eventId)?.map((q) => q.extraction)).toEqual([null, null, null]);
  });
});

describe("Cloud Scheduler's OIDC token on the reset route (EM-63)", () => {
  const AUDIENCE = "https://plancraft.example.app/api/internal/demo-reset";
  const INVOKER = "demo-reset@plancraft-96a8f.iam.gserviceaccount.com";
  const expected = { audience: AUDIENCE, invoker: INVOKER };

  async function signer() {
    const google = await generateKeyPair("RS256");
    const other = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(google.publicKey)), kid: "google-1", alg: "RS256" };
    const keys = createLocalJWKSet({ keys: [jwk] });
    const sign = async (claims: Record<string, unknown>, options: { key?: CryptoKey; iss?: string; aud?: string; exp?: number } = {}) =>
      new SignJWT({ email: INVOKER, email_verified: true, ...claims })
        .setProtectedHeader({ alg: "RS256", kid: "google-1" })
        .setIssuer(options.iss ?? "https://accounts.google.com")
        .setAudience(options.aud ?? AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(options.exp ?? Math.floor(Date.now() / 1000) + 600)
        .sign(options.key ?? google.privateKey);
    return { keys, sign, otherKey: other.privateKey };
  }

  it("accepts the scheduler's own, Google-signed token for this URL", async () => {
    const { keys, sign } = await signer();
    expect(await verifySchedulerToken(`Bearer ${await sign({})}`, expected, keys)).toBe(true);
  });

  it("refuses everything else", async () => {
    const { keys, sign, otherKey } = await signer();
    const refused = [
      null,
      "",
      "Basic abc",
      `Bearer ${await sign({ email: "someone@example.com" })}`,
      `Bearer ${await sign({ email_verified: false })}`,
      `Bearer ${await sign({}, { aud: "https://elsewhere.example.com/" })}`,
      `Bearer ${await sign({}, { iss: "https://evil.example.com" })}`,
      `Bearer ${await sign({}, { exp: Math.floor(Date.now() / 1000) - 3600 })}`,
      `Bearer ${await sign({}, { key: otherKey })}`,
    ];
    for (const header of refused) expect(await verifySchedulerToken(header, expected, keys)).toBe(false);
  });
});

describe("where the demo opens (EM-58)", () => {
  const event = (id: string, demoPinned: boolean) => ({ id, demoPinned }) as EventPlan;

  it("opens this browser's last demo event if it still exists, else the pinned one", () => {
    const events = [event("a", false), event("pinned", true)];
    expect(openingDemoEvent(events, "a")).toBe("a");
    expect(openingDemoEvent(events, "deleted-by-reset")).toBe("pinned");
    expect(openingDemoEvent(events, null)).toBe("pinned");
    expect(openingDemoEvent([event("a", false)], null)).toBeNull();
  });

  it("without browser storage, never redirects", () => {
    expect(firstDemoVisit()).toBe(false);
  });
});
