import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, listAll, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { DEMO_UID } from "@/lib/demo";

/** EM-67: moodboard images in Cloud Storage, owner only, with size, type and alt text enforced. */
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-plancraft",
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
});

const storage = (uid: string | null): FirebaseStorage =>
  (uid === null ? env.unauthenticatedContext() : env.authenticatedContext(uid)).storage() as unknown as FirebaseStorage;

const path = (owner: string, image = "img-1") => `users/${owner}/events/event-1/moodboard/${image}`;
const bytes = (size: number) => new Uint8Array(size);
const png = { contentType: "image/png", customMetadata: { alt: "Marigold mandap" } };

async function seed(owner: string): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage() as unknown as FirebaseStorage, path(owner)), bytes(10), png);
  });
}

describe("moodboard storage rules (EM-67)", () => {
  it("lets a Google user upload, list, read and delete their own images", async () => {
    const mine = storage("alice");
    await assertSucceeds(uploadBytes(ref(mine, path("alice")), bytes(1000), png));
    await assertSucceeds(uploadBytes(ref(mine, path("alice", "img-2")), bytes(1000), { ...png, contentType: "image/webp" }));
    await assertSucceeds(listAll(ref(mine, "users/alice/events/event-1/moodboard")));
    await assertSucceeds(getBytes(ref(mine, path("alice"))));
    await assertSucceeds(deleteObject(ref(mine, path("alice"))));
  });

  it("denies other users, the demo account and unauthenticated requests", async () => {
    await seed("alice");
    for (const uid of ["bob", DEMO_UID, null]) {
      const theirs = storage(uid);
      await assertFails(getBytes(ref(theirs, path("alice"))));
      await assertFails(listAll(ref(theirs, "users/alice/events/event-1/moodboard")));
      await assertFails(uploadBytes(ref(theirs, path("alice", "img-9")), bytes(10), png));
      await assertFails(deleteObject(ref(theirs, path("alice"))));
    }
  });

  it("enforces size, type and alt text", async () => {
    const mine = storage("alice");
    await assertFails(uploadBytes(ref(mine, path("alice")), bytes(1024 * 1024), png));
    await assertFails(uploadBytes(ref(mine, path("alice")), bytes(10), { ...png, contentType: "image/gif" }));
    await assertFails(uploadBytes(ref(mine, path("alice")), bytes(10), { ...png, contentType: "image/svg+xml" }));
    await assertFails(uploadBytes(ref(mine, path("alice")), bytes(10), { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(mine, path("alice")), bytes(10), { ...png, customMetadata: { alt: "" } }));
    await assertFails(uploadBytes(ref(mine, path("alice")), bytes(10), { ...png, customMetadata: { alt: "x".repeat(201) } }));
    await assertFails(uploadBytes(ref(mine, path("alice")), bytes(10), { ...png, customMetadata: { alt: "ok", extra: "no" } }));
  });

  it("keeps the shared demo account from uploading, even to its own path", async () => {
    await assertFails(uploadBytes(ref(storage(DEMO_UID), path(DEMO_UID)), bytes(10), png));
    await seed(DEMO_UID);
    await assertSucceeds(getBytes(ref(storage(DEMO_UID), path(DEMO_UID))));
  });

  it("denies everything outside the moodboard path", async () => {
    await assertFails(uploadBytes(ref(storage("alice"), "users/alice/other.png"), bytes(10), png));
    await assertFails(uploadBytes(ref(storage("alice"), "public/x.png"), bytes(10), png));
  });
});
