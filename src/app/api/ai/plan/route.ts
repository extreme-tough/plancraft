import { adminFirebase } from "@/lib/firebase/admin";
import { runAiCall } from "@/server/ai/pipeline";
import { aiProvider } from "@/server/ai/providers";
import { PLAN_CALL } from "@/server/ai/schemas/plan";
import { clientIp } from "@/server/client-ip";
import { serverEnv } from "@/server/env";
import { isCrossSite, jsonError } from "@/server/http";
import { consume } from "@/server/rate-limit";
import { verifyBearer } from "@/server/verify-token";

export const dynamic = "force-dynamic";
// The plan call may take up to 45 s, plus one repair attempt.
export const maxDuration = 100;

/** Plan generation (spec §7.3, AI-01): the event's own inputs in, a validated plan out. */
export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return jsonError(403, "FORBIDDEN", "Cross-site requests aren't allowed.");
  const env = serverEnv();
  const { auth, db } = adminFirebase();
  try {
    return await runAiCall(request, PLAN_CALL, {
      verifyToken: (header) => verifyBearer(auth, header),
      consume: (rules, now) => consume(db, rules, now),
      provider: aiProvider(env),
      clientIp: clientIp(request.headers, env.TRUSTED_PROXY_HOPS) ?? "unknown",
      limits: { dailyCap: env.AI_DAILY_CAP },
      now: () => new Date(),
      // Rule IDs and outcomes only: never user text or AI text (spec §7.2.11).
      log: (entry) => console.info(JSON.stringify({ event: "ai_call", ...entry })),
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "ai_call", call: "plan", outcome: "INTERNAL", reason: error instanceof Error ? error.name : "unknown" }));
    return jsonError(500, "INTERNAL", "Something went wrong. Please try again.", { retryable: true });
  }
}
