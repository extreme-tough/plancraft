import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { QuoteSchema } from "@/domain/quote";
import { EventPlanSchema } from "@/domain/schemas";
import { DEMO_UID } from "@/lib/demo";
import type { DemoStore, ResetRecord } from "./demo-reset";

/** /demo/status: written by the reset only, never readable by clients (firestore.rules). */
export const DEMO_STATUS_PATH = "demo/status";

/** The demo account's data through the Admin SDK, validated with the same schemas as the app. */
export function firestoreDemoStore(db: Firestore): DemoStore {
  const events = db.collection(`users/${DEMO_UID}/events`);
  return {
    // listDocuments() also finds events whose document is gone but whose quotes remain.
    eventIds: async () => (await events.listDocuments()).map((ref) => ref.id),
    deleteEvent: (eventId) => db.recursiveDelete(events.doc(eventId)),
    writeEvent: async (plan) => {
      await events.doc(plan.id).set(EventPlanSchema.parse(plan));
    },
    writeQuote: async (eventId, quote) => {
      await events.doc(eventId).collection("quotes").doc(quote.id).set(QuoteSchema.parse(quote));
    },
    recordReset: async (record: ResetRecord) => {
      await db.doc(DEMO_STATUS_PATH).set(record);
    },
  };
}

/** When the demo was last reset, and whether it got a plan (EM-58's banner, `pnpm demo:reset`). */
export async function lastDemoReset(db: Firestore): Promise<{ lastResetAt: string | null; outcome: string | null }> {
  const snapshot = await db.doc(DEMO_STATUS_PATH).get();
  const at: unknown = snapshot.get("at");
  const outcome: unknown = snapshot.get("outcome");
  return { lastResetAt: typeof at === "string" ? at : null, outcome: typeof outcome === "string" ? outcome : null };
}
