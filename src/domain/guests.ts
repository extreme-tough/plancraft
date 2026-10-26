import type { BudgetLine, EventPlan } from "./schemas";

/**
 * Guest-based pricing (EM-17, EM-43). A per-guest line follows the event's guest count
 * (guestSource "event") or carries its own count ("own", e.g. a 40-guest rehearsal dinner).
 */

/** Guests a line is priced for, or null for a flat line. */
export function lineGuests(line: BudgetLine, eventGuests: number): number | null {
  if (line.pricing === "flat") return null;
  return line.guestSource === "own" ? line.ownGuests : eventGuests;
}

/** For a confirmed per-guest line, the guest count its frozen amount was confirmed for. */
export function confirmedGuests(line: BudgetLine): number | null {
  if (line.pricing !== "per_guest" || line.label !== "confirmed" || !line.unitCost) return null;
  return Math.round(line.amount / line.unitCost);
}

/**
 * Re-derives every per-guest amount from unit cost × guests (INV-9). Confirmed lines keep their
 * amount whatever the guest count (EM-42); the diff warns about them instead.
 */
export function syncPerGuestAmounts(plan: EventPlan): EventPlan {
  let changed = false;
  const lines = plan.lines.map((line) => {
    if (line.pricing !== "per_guest" || line.label === "confirmed" || line.unitCost === null) return line;
    const guests = lineGuests(line, plan.guestCount) ?? 0;
    const amount = line.unitCost * guests;
    if (amount === line.amount) return line;
    changed = true;
    return { ...line, amount };
  });
  return changed ? { ...plan, lines } : plan;
}

/**
 * Turns an allocated amount into a per-guest unit cost (floor), so unit cost × guests never
 * exceeds the allocation. The leftover minor units fall into "remaining".
 */
export function unitCostFromAllocation(allocated: number, guests: number): number {
  if (guests <= 0) throw new RangeError("Guests must be at least 1");
  return Math.floor(allocated / guests);
}
