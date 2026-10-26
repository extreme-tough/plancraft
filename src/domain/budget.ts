import { percentTenths } from "./allocation";
import type { Minor } from "./money";
import type { EventPlan } from "./schemas";

/** Budget figures, always calculated and never stored (EM-16, EM-44). */
export interface BudgetSummary {
  budget: Minor;
  allocated: Minor;
  /** budget − allocated. Negative is a shortfall. Invariant: allocated + remaining = budget (INV-1). */
  remaining: Minor;
  shortfall: Minor;
  confirmed: Minor;
  /** Confirmed costs alone exceed the budget: no trade-off can close the gap (EM-42). */
  confirmedOverrun: Minor;
  /** Line id → share of the budget in tenths of a percent (333 = 33.3%). */
  percentTenths: ReadonlyMap<string, number>;
}

export function summarizeBudget(plan: Pick<EventPlan, "budget" | "lines">): BudgetSummary {
  const allocated = plan.lines.reduce((sum, line) => sum + line.amount, 0);
  const remaining = plan.budget - allocated;
  const confirmed = plan.lines.filter((l) => l.label === "confirmed").reduce((sum, l) => sum + l.amount, 0);

  const parts = [...plan.lines.map((l) => l.amount), Math.max(remaining, 0)];
  // Shares of the budget: they add up to exactly 100.0% with "remaining", and above 100% in a shortfall.
  const tenths = percentTenths(parts, plan.budget);

  return {
    budget: plan.budget,
    allocated,
    remaining,
    shortfall: Math.max(-remaining, 0),
    confirmed,
    confirmedOverrun: Math.max(confirmed - plan.budget, 0),
    percentTenths: new Map(plan.lines.map((line, i) => [line.id, tenths[i] ?? 0])),
  };
}
