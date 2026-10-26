/**
 * The caller's IP for rate limits (ENG-08). Each trusted proxy appends one entry to
 * X-Forwarded-For, so the client is `hops` entries from the right. Anything further left was sent
 * by the browser and can be forged, so it is never used.
 */
export function clientIp(headers: Headers, trustedProxyHops: number): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded || trustedProxyHops < 1) return null;
  const entries = forwarded
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const candidate = entries[entries.length - trustedProxyHops];
  return candidate && /^[0-9a-fA-F:.]{2,45}$/.test(candidate) ? candidate : null;
}
