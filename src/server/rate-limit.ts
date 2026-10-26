import { createHash } from "node:crypto";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";

/**
 * Fixed-window rate limits stored in Firestore, so they hold across every Cloud Run instance
 * (ENG-08). Counters live under /usage/{IST day}/counters/{hash}, which clients can't read or
 * write (firestore.rules); an `expiresAt` field lets a Firestore TTL policy clean them up.
 *
 * Counting uses atomic increments rather than read-then-write transactions: the daily cap is one
 * document shared by every user, and transactions on it would queue every AI call behind the others.
 * A request increments first, then checks; if it went over any limit it undoes its increments and is
 * refused. Under a burst this can briefly refuse a request that would have fitted, never the reverse.
 */
export interface LimitRule {
  /** What is being counted, e.g. "ai:user:abc" or "demo-session:ip:1.2.3.4". */
  key: string;
  limit: number;
  /** Window length; 86_400 means "per IST calendar day". */
  windowSeconds: number;
}

export type LimitResult = { ok: true } | { ok: false; rule: LimitRule; retryAfterSeconds: number };

const IST_OFFSET_MS = 330 * 60_000;
export const DAY_SECONDS = 86_400;

/** The calendar day in India (UTC+5:30), which is when the daily caps reset. */
export function istDay(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Start of the window containing `now`, in ms. Daily windows start at midnight IST. */
export function windowStart(now: Date, windowSeconds: number): number {
  const ms = windowSeconds * 1000;
  if (windowSeconds === DAY_SECONDS) {
    return Math.floor((now.getTime() + IST_OFFSET_MS) / ms) * ms - IST_OFFSET_MS;
  }
  return Math.floor(now.getTime() / ms) * ms;
}

export function counterId(rule: LimitRule, now: Date): string {
  return createHash("sha256").update(`${rule.key}|${rule.windowSeconds}|${windowStart(now, rule.windowSeconds)}`).digest("hex");
}

function retryAfter(rule: LimitRule, now: Date): number {
  const end = windowStart(now, rule.windowSeconds) + rule.windowSeconds * 1000;
  return Math.max(1, Math.ceil((end - now.getTime()) / 1000));
}

/** Counts one request against every rule; refuses (and counts nothing) if any rule is over its limit. */
export async function consume(db: Firestore, rules: readonly LimitRule[], now: Date): Promise<LimitResult> {
  if (rules.length === 0) return { ok: true };
  const day = istDay(now);
  const refs = rules.map((rule) => db.doc(`usage/${day}/counters/${counterId(rule, now)}`));

  const increment = db.batch();
  rules.forEach((rule, i) => {
    const expiresAt = new Date(windowStart(now, rule.windowSeconds) + (rule.windowSeconds + DAY_SECONDS) * 1000);
    increment.set(refs[i] as DocumentReference, { count: FieldValue.increment(1), expiresAt }, { merge: true });
  });
  await increment.commit();

  const snapshots = await db.getAll(...refs);
  const overIndex = rules.findIndex((rule, i) => Number(snapshots[i]?.get("count") ?? 0) > rule.limit);
  if (overIndex === -1) return { ok: true };

  const undo = db.batch();
  for (const ref of refs) undo.update(ref, { count: FieldValue.increment(-1) });
  await undo.commit();
  const rule = rules[overIndex] as LimitRule;
  return { ok: false, rule, retryAfterSeconds: retryAfter(rule, now) };
}
