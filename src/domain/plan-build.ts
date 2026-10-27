import { allocateLargestRemainder } from "./allocation";
import type { IsoDate } from "./dates";
import { unitCostFromAllocation } from "./guests";
import { majorNumberToMinor, minorToMajor } from "./money";
import type { PlanRequest, PlanResponse } from "./plan-contract";
import { EventPlanSchema, type BudgetLine, type EventPlan, type Task } from "./schemas";

/**
 * The plan call's request, built only from the user's own saved inputs (EM-03, EM-07, AI-01):
 * every event field and every onboarding answer. Money goes out in major units (spec §7.2.4).
 */
export function planRequestFor(plan: EventPlan, today: IsoDate): PlanRequest {
  const { answers } = plan;
  return {
    useCase: plan.useCase,
    eventType: plan.eventType,
    occasion: plan.occasion,
    location: { ...plan.location },
    eventDate: plan.eventDate,
    today,
    currency: plan.currency,
    budget: minorToMajor(plan.budget, plan.currency),
    guestCount: plan.guestCount,
    parts: plan.parts.map((part) => ({ name: part.name, guestCount: part.guestCount })),
    answers: {
      priorities: [...answers.priorities],
      mustHaves: [...answers.mustHaves],
      ...(answers.experience ? { experience: answers.experience } : {}),
      atmosphere: answers.atmosphere,
      ageGroups: [...answers.ageGroups],
      cultural: answers.cultural,
      accessibility: answers.accessibility,
      venueConstraints: answers.venueConstraints,
    },
    description: plan.description,
  };
}

/**
 * Turns a validated plan response into stored lines and tasks (spec §7.3, "what code does after
 * validation"): keys become ids, the budget is split by weight with the largest-remainder method
 * (EM-14), per-guest lines get unit cost = floor(allocation ÷ guests) and amount = unit cost × guests
 * with the leftover going to remaining (INV-9), and every line is labelled AI Estimate (EM-19).
 *
 * Estimates are stored in the line's own unit: per guest for per-guest lines (like unitCost), the
 * line total for flat lines. `newId` is injected so the result is deterministic in tests.
 */
export function applyGeneratedPlan(plan: EventPlan, response: PlanResponse, newId: () => string): EventPlan {
  const lineIds = new Map(response.budgetLines.map((line) => [line.key, newId()]));
  const taskIds = new Map(response.tasks.map((task) => [task.key, newId()]));
  const partsByName = new Map(plan.parts.map((part) => [part.name, part]));
  const allocations = allocateLargestRemainder(plan.budget, response.budgetLines.map((line) => line.weight));
  const toMinor = (major: number): number => majorNumberToMinor(major, plan.currency);

  const lines: BudgetLine[] = response.budgetLines.map((line, i) => {
    const part = line.part === null ? undefined : partsByName.get(line.part);
    const allocated = allocations[i] ?? 0;
    const base = {
      id: lineIds.get(line.key) as string,
      category: line.category,
      name: line.name,
      partId: part?.id ?? null,
      label: "ai_estimate" as const,
      quoteId: null,
      estimate: { low: toMinor(line.estimateLow), high: toMinor(line.estimateHigh) },
      assumptions: line.assumptions,
      vendorNeeds: line.vendorNeeds,
      vendorQuestions: line.vendorQuestions,
      payment: null,
    };
    if (line.pricing === "flat") {
      return { ...base, pricing: "flat", guestSource: null, ownGuests: null, unitCost: null, amount: allocated };
    }
    // A part's line is priced for that part's own guests; otherwise it follows the event (EM-43).
    const guests = part ? part.guestCount : plan.guestCount;
    const unitCost = unitCostFromAllocation(allocated, guests);
    return {
      ...base,
      pricing: "per_guest",
      guestSource: part ? "own" : "event",
      ownGuests: part ? part.guestCount : null,
      unitCost,
      amount: unitCost * guests,
    };
  });

  const tasks: Task[] = response.tasks.map((task) => ({
    id: taskIds.get(task.key) as string,
    title: task.title,
    lineId: task.line === null ? null : (lineIds.get(task.line) ?? null),
    priority: task.priority,
    leadTimeDays: task.leadTimeDays,
    durationDays: task.durationDays,
    dependsOn: task.dependsOn.map((key) => taskIds.get(key) as string),
    status: "not_started",
  }));

  // Parsing re-checks every invariant (references, loops, INV-9) before anything is saved.
  return EventPlanSchema.parse({
    ...plan,
    lines,
    tasks,
    assumptions: response.assumptions,
    openQuestions: response.openQuestions,
  });
}

/**
 * A line's estimate range for its whole quantity, for display: per-guest estimates times guests.
 * Calculated on read, never stored.
 */
export function lineEstimateTotal(line: BudgetLine, eventGuests: number): { low: number; high: number } | null {
  if (!line.estimate) return null;
  if (line.pricing === "flat") return line.estimate;
  const guests = line.guestSource === "own" ? (line.ownGuests ?? 0) : eventGuests;
  return { low: line.estimate.low * guests, high: line.estimate.high * guests };
}

/** "Under-funded": the line's amount is below the low end of its estimate (spec §7.3). */
export function isUnderFunded(line: BudgetLine, eventGuests: number): boolean {
  const total = lineEstimateTotal(line, eventGuests);
  return total !== null && line.amount < total.low;
}
