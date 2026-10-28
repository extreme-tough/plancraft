import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/**
 * Cloud Scheduler's call to the demo reset (EM-63) carries a Google-signed OIDC token for the
 * scheduler's service account. Only that account, with the reset URL as the audience, may reset
 * the demo: the signature (Google's published keys), issuer, audience, expiry and the verified
 * email are all checked. Anything else is refused the same way, so a caller learns nothing.
 */
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

let googleKeys: JWTVerifyGetKey | undefined;

function googlePublicKeys(): JWTVerifyGetKey {
  googleKeys ??= createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  return googleKeys;
}

export interface SchedulerIdentity {
  /** The reset URL, which Cloud Scheduler uses as the token's audience. */
  audience: string;
  /** The service account email Cloud Scheduler signs as. */
  invoker: string;
}

export async function verifySchedulerToken(
  authorization: string | null,
  expected: SchedulerIdentity,
  keys: JWTVerifyGetKey = googlePublicKeys(),
): Promise<boolean> {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization?.trim() ?? "");
  if (!match?.[1]) return false;
  try {
    const { payload } = await jwtVerify(match[1], keys, {
      issuer: GOOGLE_ISSUERS,
      audience: expected.audience,
      algorithms: ["RS256"],
      clockTolerance: 30,
    });
    return payload.email === expected.invoker && payload.email_verified === true;
  } catch {
    return false;
  }
}
