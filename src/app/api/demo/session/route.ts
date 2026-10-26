import { adminFirebase } from "@/lib/firebase/admin";
import { DEMO_UID } from "@/lib/demo";
import { clientIp } from "@/server/client-ip";
import { serverEnv } from "@/server/env";
import { isCrossSite, jsonError, jsonOk } from "@/server/http";
import { consume } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * EM-58: signs the browser in to the one shared demo account. No password exists: the server mints
 * a Firebase custom token for the fixed uid, which is the only way to obtain that account.
 */
export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return jsonError(403, "FORBIDDEN", "Cross-site requests aren't allowed.");

  const env = serverEnv();
  const { auth, db } = adminFirebase();
  const ip = clientIp(request.headers, env.TRUSTED_PROXY_HOPS) ?? "unknown";

  try {
    const limit = await consume(db, [{ key: `demo-session:ip:${ip}`, limit: env.DEMO_SESSION_LIMIT_PER_MINUTE, windowSeconds: 60 }], new Date());
    if (!limit.ok) {
      return jsonError(429, "RATE_LIMITED", "Too many demo sign-ins from this network. Please wait a minute.", {
        retryable: true,
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }
    const token = await auth.createCustomToken(DEMO_UID, { demo: true });
    return jsonOk({ token });
  } catch (error) {
    console.error("demo-session failed", { reason: error instanceof Error ? error.name : "unknown" });
    return jsonError(500, "INTERNAL", "The demo couldn't start. Please try again.", { retryable: true });
  }
}
