import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FirestoreEventRepository } from "@/data/firestore-repository";
import { VersionConflictError } from "@/data/repository";
import { DEMO_UID } from "@/lib/demo";
import { makePlan } from "../support/factories";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-plancraft",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const db = (uid: string | null): Firestore =>
  (uid === null ? env.unauthenticatedContext() : env.authenticatedContext(uid)).firestore() as unknown as Firestore;

const eventDoc = (asUid: string | null, ownerUid: string, eventId = "event-1") => doc(db(asUid), `users/${ownerUid}/events/${eventId}`);

const plan = (overrides: Parameters<typeof makePlan>[0] = {}) => makePlan({ id: "event-1", ...overrides });

async function seed(ownerUid: string, data = plan({ isDemo: ownerUid === DEMO_UID })): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore() as unknown as Firestore, `users/${ownerUid}/events/${data.id}`), data);
  });
}

describe("per-user isolation (EM-59)", () => {
  it("lets the owner create, read, update and delete their event", async () => {
    await assertSucceeds(setDoc(eventDoc("alice", "alice"), plan()));
    await assertSucceeds(getDoc(eventDoc("alice", "alice")));
    await assertSucceeds(setDoc(eventDoc("alice", "alice"), plan({ version: 1, occasion: "Renamed" })));
    await assertSucceeds(deleteDoc(eventDoc("alice", "alice")));
  });

  it("denies another Google user", async () => {
    await seed("alice");
    await assertFails(getDoc(eventDoc("bob", "alice")));
    await assertFails(setDoc(eventDoc("bob", "alice"), plan({ version: 1 })));
    await assertFails(deleteDoc(eventDoc("bob", "alice")));
  });

  it("keeps the shared demo account and Google users apart, both ways (EM-58)", async () => {
    await seed("alice");
    await seed(DEMO_UID);
    await assertFails(getDoc(eventDoc(DEMO_UID, "alice")));
    await assertFails(getDoc(eventDoc("alice", DEMO_UID)));
    await assertSucceeds(getDoc(eventDoc(DEMO_UID, DEMO_UID)));
  });

  it("denies unauthenticated requests", async () => {
    await seed("alice");
    await assertFails(getDoc(eventDoc(null, "alice")));
    await assertFails(setDoc(eventDoc(null, "alice", "new"), plan({ id: "new" })));
  });

  it("closes the server-only collections to every client", async () => {
    await assertFails(getDoc(doc(db("alice"), "usage/2026-10-26/counters/x")));
    await assertFails(setDoc(doc(db("alice"), "usage/2026-10-26/counters/x"), { count: 0 }));
    await assertFails(getDoc(doc(db(DEMO_UID), "demo/state")));
    await assertFails(setDoc(doc(db(DEMO_UID), "demo/state"), { pinnedEventId: "x" }));
  });
});

describe("event shape and versions (EM-59, EM-62)", () => {
  it("only accepts version 0 on create and exactly version + 1 on update", async () => {
    await assertFails(setDoc(eventDoc("alice", "alice"), plan({ version: 3 })));
    await assertSucceeds(setDoc(eventDoc("alice", "alice"), plan()));
    await assertFails(setDoc(eventDoc("alice", "alice"), plan({ version: 0, occasion: "Same version" })));
    await assertFails(setDoc(eventDoc("alice", "alice"), plan({ version: 2 })));
    await assertSucceeds(setDoc(eventDoc("alice", "alice"), plan({ version: 1 })));
  });

  it("rejects malformed events", async () => {
    await assertFails(setDoc(eventDoc("alice", "alice"), { ...plan(), extra: "field" }));
    await assertFails(setDoc(eventDoc("alice", "alice"), plan({ budget: -5 })));
    await assertFails(setDoc(eventDoc("alice", "alice"), plan({ description: "x".repeat(2001) })));
    await assertFails(setDoc(eventDoc("alice", "alice"), plan({ id: "other-id" })));
    await assertFails(setDoc(eventDoc("alice", "alice"), plan({ guestCount: 0 })));
  });

  it("ties isDemo to the demo account and keeps the pin out of clients' hands (EM-63)", async () => {
    await assertFails(setDoc(eventDoc("alice", "alice"), plan({ isDemo: true })));
    await assertFails(setDoc(eventDoc(DEMO_UID, DEMO_UID), plan({ isDemo: false })));
    await assertFails(setDoc(eventDoc(DEMO_UID, DEMO_UID), plan({ isDemo: true, demoPinned: true })));
    await seed(DEMO_UID, plan({ isDemo: true, demoPinned: true }));
    await assertFails(setDoc(eventDoc(DEMO_UID, DEMO_UID), plan({ isDemo: true, demoPinned: false, version: 1 })));
  });
});

describe("FirestoreEventRepository against the rules", () => {
  it("creates, reads and saves with version checks (EM-39, EM-62)", async () => {
    const repo = new FirestoreEventRepository(db("alice"), "alice");
    const created = await repo.createEvent(plan({ version: 7 }));
    expect(created.version).toBe(0);
    expect(await repo.getEvent("event-1")).toEqual(created);

    const saved = await repo.saveEvent({ ...created, occasion: "Renamed" }, 0);
    expect(saved.version).toBe(1);
    expect((await repo.listEvents()).map((e) => e.occasion)).toEqual(["Renamed"]);
  });

  it("refuses a stale save and hands back the latest version, as two demo reviewers would see it", async () => {
    const reviewerA = new FirestoreEventRepository(db(DEMO_UID), DEMO_UID);
    const reviewerB = new FirestoreEventRepository(db(DEMO_UID), DEMO_UID);
    const created = await reviewerA.createEvent(plan({ isDemo: true }));

    await reviewerA.saveEvent({ ...created, occasion: "A's change" }, 0);
    const conflict = await reviewerB.saveEvent({ ...created, occasion: "B's change" }, 0).catch((e: unknown) => e);
    expect(conflict).toBeInstanceOf(VersionConflictError);
    expect((conflict as VersionConflictError).latest.occasion).toBe("A's change");
    expect((await reviewerB.getEvent("event-1"))?.occasion).toBe("A's change");
  });

  it("stores proposals apart from the plan and deletes them with the event (EM-53)", async () => {
    const repo = new FirestoreEventRepository(db("alice"), "alice");
    await repo.createEvent(plan());
    await repo.saveProposal({
      id: "p1",
      eventId: "event-1",
      kind: "revision",
      name: null,
      baseVersion: 0,
      changes: [{ field: "budget", before: "80000000", after: "60000000" }],
      requestText: null,
      deterministicOps: [{ op: "set_event_budget", value: 60_000_000 }],
      options: [],
      interpretation: null,
      assumptions: [],
      selectedOption: null,
    });
    expect((await repo.getEvent("event-1"))?.version).toBe(0);
    expect(await repo.listProposals("event-1")).toHaveLength(1);
    await repo.deleteEvent("event-1");
    expect(await repo.getEvent("event-1")).toBeNull();
    expect(await repo.listProposals("event-1")).toHaveLength(0);
  });
});
