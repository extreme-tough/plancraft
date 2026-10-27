import type { z } from "zod";
import { DEMO_UID } from "@/lib/demo";
import { jsonError, jsonOk, type ErrorCode } from "@/server/http";
import { DAY_SECONDS, type LimitResult, type LimitRule } from "@/server/rate-limit";
import type { AiCallName, AiProvider, ModelFailure } from "./provider";
import { cleanStrings } from "./text";

/**
 * Every AI call goes through here, in this order (CLAUDE.md, spec §7.2):
 * verify the ID token → rate limits → request schema and rules → prompt → model (with timeout) →
 * JSON.parse → output schema → rules → one repair attempt with the failed rule IDs → envelope.
 * Nothing that fails validation is ever returned (AI-11). Logs carry rule IDs only, never text.
 */

export interface AiCallSpec<Req, Res> {
  name: AiCallName;
  requestSchema: z.ZodType<Req>;
  /** Request rules beyond the schema; a message means 400. */
  requestProblem(request: Req, now: Date): string | null;
  responseSchema: z.ZodType<Res>;
  providerSchema: Record<string, unknown>;
  /** Failed rule IDs; empty means valid. */
  rules(response: Res, request: Req): string[];
  /** Plain-language meaning of each rule, for the repair prompt. */
  ruleText: Readonly<Record<string, string>>;
  system: string;
  user(request: Req): string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

/** Rule IDs for the two failures that come before the call's own rules. */
export const PARSE_RULE = "JSON";
export const SCHEMA_RULE = "SCHEMA";

export type Validation<Res> = { ok: true; data: Res } | { ok: false; failed: string[] };

/** Parse → clean → schema → rules. Pure, so contract tests can feed it any model text. */
export function validateOutput<Req, Res>(spec: AiCallSpec<Req, Res>, text: string, request: Req): Validation<Res> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, failed: [PARSE_RULE] };
  }
  const result = spec.responseSchema.safeParse(cleanStrings(parsed));
  if (!result.success) return { ok: false, failed: [SCHEMA_RULE] };
  const failed = spec.rules(result.data, request);
  return failed.length === 0 ? { ok: true, data: result.data } : { ok: false, failed };
}

export type Generation<Res> =
  | { ok: true; data: Res; attempts: number }
  | { ok: false; code: ModelFailure | "AI_INVALID_OUTPUT"; attempts: number; failed: string[] };

function repairPrompt(user: string, failed: readonly string[], ruleText: Readonly<Record<string, string>>): string {
  const reasons = failed.map((id) => {
    if (id === PARSE_RULE) return `- ${id}: the answer was not valid JSON.`;
    if (id === SCHEMA_RULE) return `- ${id}: the answer did not match the response schema (fields, types, lengths or counts).`;
    return `- ${id}: ${ruleText[id] ?? "a rule failed."}`;
  });
  return `${user}\n\nYour previous answer was rejected by these checks:\n${reasons.join("\n")}\nReturn a corrected JSON object that passes all of them.`;
}

/**
 * At most two model calls per user action (ENG-11): one, plus one repair when the output is invalid.
 * Timeouts, outages and safety blocks are not retried automatically (spec §7.2.8).
 */
export async function generateValidated<Req, Res>(
  spec: AiCallSpec<Req, Res>,
  request: Req,
  provider: AiProvider,
): Promise<Generation<Res>> {
  let user = spec.user(request);
  let failed: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await provider.generate({
      call: spec.name,
      system: spec.system,
      user,
      responseSchema: spec.providerSchema,
      temperature: spec.temperature,
      maxOutputTokens: spec.maxOutputTokens,
      timeoutMs: spec.timeoutMs,
    });
    if (result.kind === "error") return { ok: false, code: result.code, attempts: attempt, failed };
    const validation = validateOutput(spec, result.text, request);
    if (validation.ok) return { ok: true, data: validation.data, attempts: attempt };
    failed = validation.failed;
    user = repairPrompt(spec.user(request), failed, spec.ruleText);
  }
  return { ok: false, code: "AI_INVALID_OUTPUT", attempts: 2, failed };
}

export interface Caller {
  uid: string;
  isDemo: boolean;
}

export interface AiLimits {
  dailyCap: number;
}

/**
 * ENG-08 limits: Google users per user ID (10 a minute, 100 a day); the shared demo account per IP
 * (10 a minute, 50 a day) and 1,500 a day for the whole demo; 2,000 a day across everyone.
 */
export function aiLimitRules(caller: Caller, ip: string, limits: AiLimits): LimitRule[] {
  const own = caller.isDemo
    ? [
        { key: `ai:demo-ip:${ip}`, limit: 10, windowSeconds: 60 },
        { key: `ai:demo-ip:${ip}`, limit: 50, windowSeconds: DAY_SECONDS },
        { key: "ai:demo-total", limit: 1500, windowSeconds: DAY_SECONDS },
      ]
    : [
        { key: `ai:user:${caller.uid}`, limit: 10, windowSeconds: 60 },
        { key: `ai:user:${caller.uid}`, limit: 100, windowSeconds: DAY_SECONDS },
      ];
  return [...own, { key: "ai:all", limit: limits.dailyCap, windowSeconds: DAY_SECONDS }];
}

/** Shared caps (everyone, or the whole demo) mean "AI is done for today"; the rest are per caller. */
export function isDailyCap(rule: LimitRule): boolean {
  return rule.key === "ai:all" || rule.key === "ai:demo-total";
}

export const DAILY_LIMIT_MESSAGE =
  "We've reached today's limit for AI help. Your plan still works and you can keep editing. Please try the AI features again tomorrow.";

export interface PipelineDeps {
  verifyToken(authorization: string | null): Promise<Caller | null>;
  consume(rules: readonly LimitRule[], now: Date): Promise<LimitResult>;
  provider: AiProvider;
  clientIp: string;
  limits: AiLimits;
  now(): Date;
  log(entry: Record<string, unknown>): void;
}

export const MAX_BODY_BYTES = 100 * 1024;

const FAILURES: Record<ModelFailure | "AI_INVALID_OUTPUT", { status: number; message: string; retryable: boolean }> = {
  AI_UNAVAILABLE: { status: 503, message: "The AI service is unavailable right now. Please try again.", retryable: true },
  AI_TIMEOUT: { status: 504, message: "The AI took too long to answer. Please try again.", retryable: true },
  AI_INVALID_OUTPUT: { status: 502, message: "The AI's answer didn't pass our checks, so it wasn't used. Please try again.", retryable: true },
  AI_BLOCKED: { status: 502, message: "The AI declined to answer this request.", retryable: false },
};

export async function runAiCall<Req, Res>(
  request: Request,
  spec: AiCallSpec<Req, Res>,
  deps: PipelineDeps,
): Promise<Response> {
  const started = Date.now();
  const log = (outcome: string, extra: Record<string, unknown> = {}): void =>
    deps.log({ call: spec.name, outcome, ms: Date.now() - started, ...extra });
  const fail = (status: number, code: ErrorCode, message: string, options?: { retryable?: boolean; retryAfterSeconds?: number }): Response => {
    log(code);
    return jsonError(status, code, message, options);
  };

  // 1. Who is calling (spec §7.2.1).
  const caller = await deps.verifyToken(request.headers.get("authorization"));
  if (!caller) return fail(401, "UNAUTHENTICATED", "Please sign in again.");

  // 2. Rate limits, counted in Firestore so they hold across instances (ENG-08).
  const now = deps.now();
  const limit = await deps.consume(aiLimitRules(caller, deps.clientIp, deps.limits), now);
  if (!limit.ok) {
    return isDailyCap(limit.rule)
      ? fail(429, "DAILY_LIMIT_REACHED", DAILY_LIMIT_MESSAGE, { retryable: false, retryAfterSeconds: limit.retryAfterSeconds })
      : fail(429, "RATE_LIMITED", "Too many AI requests. Please wait a moment and try again.", {
          retryable: true,
          retryAfterSeconds: limit.retryAfterSeconds,
        });
  }

  // 3. The request itself: size, JSON, schema, rules. Bad requests never reach the model.
  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return fail(400, "INVALID_REQUEST", "The request is too large.");
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return fail(400, "INVALID_REQUEST", "The request isn't valid JSON.");
  }
  const parsed = spec.requestSchema.safeParse(json);
  if (!parsed.success) return fail(400, "INVALID_REQUEST", "The request doesn't match what this call expects.");
  const problem = spec.requestProblem(parsed.data, now);
  if (problem) return fail(400, "INVALID_REQUEST", problem);

  // 4–7. Prompt, model, validation and at most one repair.
  const result = await generateValidated(spec, parsed.data, deps.provider);
  if (!result.ok) {
    const failure = FAILURES[result.code];
    log(result.code, { attempts: result.attempts, rules: result.failed });
    return jsonError(failure.status, result.code, failure.message, { retryable: failure.retryable });
  }
  log("ok", { attempts: result.attempts, isDemo: caller.isDemo });
  return jsonOk(result.data, { meta: { attempts: result.attempts, model: deps.provider.model } });
}

/** EM-58: the demo account is recognised by its fixed uid, whatever its claims say. */
export function callerFrom(uid: string): Caller {
  return { uid, isDemo: uid === DEMO_UID };
}
