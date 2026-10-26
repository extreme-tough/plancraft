/**
 * JSON envelopes for every API route (spec §7.2): `{ ok: true, data }` or
 * `{ ok: false, error: { code, message, retryable } }`. Responses are never cached.
 */
export type ErrorCode =
  | "INVALID_REQUEST"
  | "FORBIDDEN"
  | "UNAUTHENTICATED"
  | "RATE_LIMITED"
  | "DAILY_LIMIT_REACHED"
  | "INTERNAL";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function jsonOk<T>(data: T, init: ResponseInit = {}): Response {
  return Response.json({ ok: true, data }, { ...init, headers: { ...NO_STORE, ...init.headers } });
}

export function jsonError(
  status: number,
  code: ErrorCode,
  message: string,
  options: { retryable?: boolean; retryAfterSeconds?: number } = {},
): Response {
  const headers: Record<string, string> = { ...NO_STORE };
  if (options.retryAfterSeconds !== undefined) headers["Retry-After"] = String(options.retryAfterSeconds);
  return Response.json(
    { ok: false, error: { code, message, retryable: options.retryable ?? false } },
    { status, headers },
  );
}

/**
 * Same-origin guard for state-changing endpoints: browsers send Sec-Fetch-Site, and anything other
 * than "same-origin" is another site calling us. Requests without it (non-browser tools) pass.
 */
export function isCrossSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin";
}
