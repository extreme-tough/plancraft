import type { Auth } from "firebase-admin/auth";
import { callerFrom, type Caller } from "./ai/pipeline";

/**
 * The caller behind an `Authorization: Bearer <Firebase ID token>` header (spec §7.2.1), or null.
 * The Admin SDK checks the signature, expiry, issuer and audience, so expired tokens and tokens from
 * another Firebase project are refused. Revocation isn't checked: it costs a round trip per call.
 */
export async function verifyBearer(auth: Pick<Auth, "verifyIdToken">, authorization: string | null): Promise<Caller | null> {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization?.trim() ?? "");
  if (!match?.[1]) return null;
  try {
    const decoded = await auth.verifyIdToken(match[1]);
    return callerFrom(decoded.uid);
  } catch {
    return null;
  }
}
