"use client";

import { z } from "zod";

/** The response envelope of every /api/ai/* call (spec §7.2.9), checked rather than trusted. */
const EnvelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }),
  }),
]);

export interface AiError {
  code: string;
  message: string;
  retryable: boolean;
  /** From Retry-After on a 429; the UI counts down before Retry is enabled again (spec §7.6). */
  retryAfterSeconds: number | null;
}

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: AiError };

const NETWORK: AiError = {
  code: "NETWORK",
  message: "PlanCraft couldn't be reached. Check your connection and try again.",
  retryable: true,
  retryAfterSeconds: null,
};

const INVALID: AiError = {
  code: "AI_INVALID_OUTPUT",
  message: "The AI's answer didn't pass our checks, so it wasn't used. Please try again.",
  retryable: true,
  retryAfterSeconds: null,
};

/**
 * Posts to an AI endpoint with the user's Firebase ID token. On 401 it refreshes the token and
 * retries once (spec §7.2.9). `data` is validated with the caller's schema before it is returned.
 */
export async function callAi<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  idToken: (forceRefresh: boolean) => Promise<string>,
): Promise<AiResult<T>> {
  let response: Response | undefined;
  for (const forceRefresh of [false, true]) {
    try {
      response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await idToken(forceRefresh)}` },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, error: NETWORK };
    }
    if (response.status !== 401) break;
  }
  if (!response) return { ok: false, error: NETWORK };

  const envelope = EnvelopeSchema.safeParse(await response.json().catch(() => null));
  if (!envelope.success) return { ok: false, error: response.ok ? INVALID : { ...NETWORK, code: `HTTP_${response.status}` } };
  if (!envelope.data.ok) {
    const retryAfter = Number(response.headers.get("retry-after"));
    return {
      ok: false,
      error: { ...envelope.data.error, retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null },
    };
  }
  const data = schema.safeParse(envelope.data.data);
  return data.success ? { ok: true, data: data.data } : { ok: false, error: INVALID };
}
