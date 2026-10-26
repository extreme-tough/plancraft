import type { Minor } from "./money";

/**
 * Splits `total` across `weights` by the largest-remainder method (EM-14, INV-5):
 * the parts are non-negative integers, add up to `total` exactly, and each is within one unit of
 * its exact proportional share. Ties go to the earlier weight, so the result is deterministic.
 */
export function allocateLargestRemainder(total: Minor, weights: readonly number[]): Minor[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError("Total must be a non-negative integer");
  if (weights.length === 0) return [];
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) throw new RangeError("Weights must be non-negative");

  // Weights arrive as decimals (the AI gives 0–100); scale to integers so the maths is exact.
  const SCALE = 1_000_000;
  const scaled = weights.map((w) => BigInt(Math.round(w * SCALE)));
  const sum = scaled.reduce((a, b) => a + b, 0n);
  if (sum === 0n) throw new RangeError("At least one weight must be above zero");

  const totalBig = BigInt(total);
  const floors = scaled.map((w) => (totalBig * w) / sum);
  const remainders = scaled.map((w, i) => ({ i, rem: (totalBig * w) % sum }));

  let leftover = Number(totalBig - floors.reduce((a, b) => a + b, 0n));
  remainders.sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  for (const { i } of remainders) {
    if (leftover === 0) break;
    floors[i] = (floors[i] ?? 0n) + 1n;
    leftover -= 1;
  }
  return floors.map(Number);
}

/**
 * Percentages to one decimal place that add up to exactly 100.0 when the parts add up to the
 * whole (EM-44). Returned in tenths of a percent: 333 means 33.3%.
 */
export function percentTenths(parts: readonly Minor[], whole: Minor): number[] {
  if (whole <= 0) return parts.map(() => 0);
  const total = parts.reduce((a, b) => a + b, 0);
  if (total === whole) return allocateLargestRemainder(1000, parts.map((p) => Math.max(p, 0)));
  return parts.map((p) => Math.round((p * 1000) / whole));
}
