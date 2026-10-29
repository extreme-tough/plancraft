import { adminFirebase } from "@/lib/firebase/admin";
import { runAiCall } from "@/server/ai/pipeline";
import { aiProvider } from "@/server/ai/providers";
import { DESCRIBE_CALL } from "@/server/ai/schemas/describe";
import { clientIp } from "@/server/client-ip";
import { serverEnv } from "@/server/env";
import { isCrossSite, jsonError } from "@/server/http";
import { consume } from "@/server/rate-limit";
import { verifyBearer } from "@/server/verify-token";

export const dynamic = "force-dynamic";
export const maxDuration = 70;

/** Describe (AI-13): the user's own description in, checked form values out. The browser fills empty fields only. */
export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return jsonError(403, "FORBIDDEN", "Cross-site requests aren't allowed.");
  const env = serverEnv();
  const { auth, db } = adminFirebase();
  try {
    return await runAiCall(request, DESCRIBE_CALL, {
      verifyToken: (header) => verifyBearer(auth, header),
      consume: (rules, now) => consume(db, rules, now),
      provider: aiProvider(env),
      clientIp: clientIp(request.headers, env.TRUSTED_PROXY_HOPS) ?? "unknown",
      limits: { dailyCap: env.AI_DAILY_CAP, demoIpPerMinute: env.AI_DEMO_IP_LIMIT_PER_MINUTE, demoIpPerDay: env.AI_DEMO_IP_LIMIT_PER_DAY },
      now: () => new Date(),
      log: (entry) => console.info(JSON.stringify({ event: "ai_call", ...entry })),
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "ai_call", call: "describe", outcome: "INTERNAL", reason: error instanceof Error ? error.name : "unknown" }));
    return jsonError(500, "INTERNAL", "Something went wrong. Please try again.", { retryable: true });
  }
}
