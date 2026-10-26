import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consume } from "@/server/rate-limit";

// Runs inside `firebase emulators:exec`, which sets FIRESTORE_EMULATOR_HOST for the Admin SDK.
let app: App;
let db: Firestore;

beforeAll(() => {
  app = initializeApp({ projectId: "demo-plancraft" }, "rate-limit-test");
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

describe("consume (ENG-08)", () => {
  it("allows up to the limit, then refuses with the time left in the window", async () => {
    const now = new Date("2026-10-26T10:00:15Z");
    const rule = { key: `test:${Math.random()}`, limit: 2, windowSeconds: 60 };
    expect(await consume(db, [rule], now)).toEqual({ ok: true });
    expect(await consume(db, [rule], now)).toEqual({ ok: true });
    expect(await consume(db, [rule], now)).toEqual({ ok: false, rule, retryAfterSeconds: 45 });
  });

  it("counts nothing when any rule is full, so limits stay consistent", async () => {
    const now = new Date("2026-10-26T10:00:00Z");
    const tight = { key: `tight:${Math.random()}`, limit: 1, windowSeconds: 60 };
    const loose = { key: `loose:${Math.random()}`, limit: 100, windowSeconds: 86_400 };
    expect((await consume(db, [tight, loose], now)).ok).toBe(true);
    expect((await consume(db, [tight, loose], now)).ok).toBe(false);
    const looseAlone = { ...loose, limit: 1 };
    // Only one request reached the loose counter, so a limit of 1 is now full.
    expect((await consume(db, [looseAlone], now)).ok).toBe(false);
  });

  it("never lets a burst of concurrent requests past the limit", async () => {
    const now = new Date("2026-10-26T11:00:00Z");
    const rule = { key: `burst:${Math.random()}`, limit: 5, windowSeconds: 60 };
    const results = await Promise.all(Array.from({ length: 12 }, () => consume(db, [rule], now)));
    const admitted = results.filter((r) => r.ok).length;
    expect(admitted).toBeLessThanOrEqual(5);
    // Refused requests undo their increments, so the counter holds exactly the admitted ones.
    const counters = await db.collection("usage/2026-10-26/counters").get();
    const counts = counters.docs.map((d) => Number(d.get("count")));
    expect(counts).toContain(admitted);
  });

  it("starts a fresh window", async () => {
    const rule = { key: `fresh:${Math.random()}`, limit: 1, windowSeconds: 60 };
    expect((await consume(db, [rule], new Date("2026-10-26T10:00:59Z"))).ok).toBe(true);
    expect((await consume(db, [rule], new Date("2026-10-26T10:01:00Z"))).ok).toBe(true);
  });
});
