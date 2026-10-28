import { adminFirebase } from "@/lib/firebase/admin";
import { lastDemoReset } from "@/server/demo-store";
import { jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

/** When the shared demo was last reset (EM-58's banner). Public: it reveals only a time and an outcome. */
export async function GET(): Promise<Response> {
  try {
    return jsonOk(await lastDemoReset(adminFirebase().db));
  } catch (error) {
    console.error(JSON.stringify({ event: "demo_status", outcome: "INTERNAL", reason: error instanceof Error ? error.name : "unknown" }));
    return jsonError(500, "INTERNAL", "The demo status couldn't be read.", { retryable: true });
  }
}
