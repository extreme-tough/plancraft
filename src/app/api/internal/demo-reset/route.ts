import { adminFirebase } from "@/lib/firebase/admin";
import { aiProvider } from "@/server/ai/providers";
import { resetDemo } from "@/server/demo-reset";
import { firestoreDemoStore } from "@/server/demo-store";
import { serverEnv } from "@/server/env";
import { jsonError, jsonOk } from "@/server/http";
import { verifySchedulerToken } from "@/server/verify-oidc";

export const dynamic = "force-dynamic";
// The plan call (45 s, plus one repair) and three quote reads in parallel (30 s, plus one repair).
export const maxDuration = 300;

/**
 * EM-63: Cloud Scheduler's nightly reset of the shared demo account (src/server/demo-reset.ts).
 * Only the scheduler's service account may call it (OIDC); without that configuration the route
 * doesn't exist. A reset without a plan answers 503, which makes Cloud Scheduler retry.
 */
export async function POST(request: Request): Promise<Response> {
  const env = serverEnv();
  if (!env.DEMO_RESET_INVOKER || !env.DEMO_RESET_AUDIENCE) return jsonError(404, "INVALID_REQUEST", "Not found.");
  const allowed = await verifySchedulerToken(request.headers.get("authorization"), {
    audience: env.DEMO_RESET_AUDIENCE,
    invoker: env.DEMO_RESET_INVOKER,
  });
  if (!allowed) return jsonError(401, "UNAUTHENTICATED", "Not allowed.");

  try {
    const result = await resetDemo({
      store: firestoreDemoStore(adminFirebase().db),
      provider: aiProvider(env),
      now: new Date(),
      newId: () => crypto.randomUUID(),
    });
    // Outcome, counts and rule IDs only: never user text or AI text.
    console.info(JSON.stringify({ event: "demo_reset", outcome: result.outcome, deleted: result.deleted, quotesRead: result.quotesRead, failed: result.failed }));
    if (result.outcome !== "ok") return jsonError(503, "AI_UNAVAILABLE", "The demo was reset without a plan.", { retryable: true });
    return jsonOk({ outcome: result.outcome, at: result.at });
  } catch (error) {
    console.error(JSON.stringify({ event: "demo_reset", outcome: "INTERNAL", reason: error instanceof Error ? error.name : "unknown" }));
    return jsonError(500, "INTERNAL", "The demo reset failed.", { retryable: true });
  }
}
