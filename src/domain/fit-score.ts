import type { QuoteView } from "./quote-checks";

/**
 * EM-68: how well a quote fits its line by our checks, 0–100, calculated by code on read and never
 * stored. Three parts, each shown to the user:
 *   budget  (50): full when the comparable total is at or under the line; minus 1 point for every 2%
 *                 over, down to 0. Nothing when it can't be compared (EM-50).
 *   needs   (30): the share of the user's needs the quote covers; full when no needs were listed.
 *   clarity (20): minus 8 for a total gap or no stated total, 6 for unclear or missing tax, 6 for any
 *                 value that doesn't add up or isn't in the quote text (Q3, Q4).
 * It only ranks: the user still links and confirms (EM-34, EM-35, AI-09).
 */
export interface FitScore {
  total: number;
  budget: number;
  needs: number;
  clarity: number;
  /** Why clarity lost points, in the order above. */
  deductions: Array<"total_gap" | "no_total" | "tax" | "unverified">;
  /** Budget fit couldn't be scored: no total in the event currency yet. */
  notCompared: boolean;
}

export const FIT_MAX = { budget: 50, needs: 30, clarity: 20 } as const;

export function fitScore(view: QuoteView, lineAmount: number): FitScore {
  let budget = 0;
  const notCompared = view.comparableTotal === null;
  if (view.comparableTotal !== null) {
    if (view.comparableTotal <= lineAmount) budget = FIT_MAX.budget;
    else if (lineAmount > 0) {
      // Integer maths: points lost = floor(over% / 2).
      const lost = Math.floor(((view.comparableTotal - lineAmount) * 50) / lineAmount);
      budget = Math.max(FIT_MAX.budget - lost, 0);
    }
  }

  const listed = view.details.needsCoverage.length;
  const needs = listed === 0 ? FIT_MAX.needs : Math.round((view.needsCovered * FIT_MAX.needs) / listed);

  const deductions: FitScore["deductions"] = [];
  if (view.totalCheck.kind === "gap") deductions.push("total_gap");
  else if (view.totalCheck.kind !== "adds_up" && view.totalCheck.kind !== "rounding") deductions.push("no_total");
  if (view.details.taxTreatment === "unclear" || view.exclTax) deductions.push("tax");
  if (view.arithmeticFlags.size > 0 || view.ungroundedItems.size > 0 || view.ungroundedTotal) deductions.push("unverified");
  const cost = { total_gap: 8, no_total: 8, tax: 6, unverified: 6 } as const;
  const clarity = Math.max(FIT_MAX.clarity - deductions.reduce((sum, d) => sum + cost[d], 0), 0);

  return { total: budget + needs + clarity, budget, needs, clarity, deductions, notCompared };
}

/**
 * The quote with the highest score among those compared on price, or null when fewer than two can
 * be compared or the top score is shared: "Best fit by our checks" only when there is one.
 */
export function bestFit(views: readonly QuoteView[], lineAmount: number): string | null {
  const scored = views.filter((view) => view.comparableTotal !== null).map((view) => ({ id: view.quote.id, score: fitScore(view, lineAmount).total }));
  if (scored.length < 2) return null;
  const top = Math.max(...scored.map((s) => s.score));
  const leaders = scored.filter((s) => s.score === top);
  return leaders.length === 1 ? (leaders[0]?.id ?? null) : null;
}
