import { daysBetween, isIsoDate, type IsoDate } from "./dates";
import { MAX_MINOR } from "./money";
import type { ConstraintChange, EventOp } from "./proposal";
import { deterministicOpsFor } from "./proposal";
import type { EventPlan } from "./schemas";

/**
 * Constraint changes (EM-27, §8.6): the canonical values a revision carries, and the code-built
 * operations they become. Budget is minor units, date is YYYY-MM-DD, guests is a whole number, all
 * as strings so a proposal stores exactly what was confirmed.
 */
export type ChangeField = ConstraintChange["field"];

export interface ChangeInput {
  field: ChangeField;
  after: string;
}

export type ChangeOps = { ok: true; ops: EventOp[] } | { ok: false; message: string };

/** Validates the changes and turns them into set_event_* ops (EM-55: a new date must be after today). */
export function opsForChanges(changes: readonly ChangeInput[], today: IsoDate): ChangeOps {
  const values: { budget?: number; eventDate?: string; guestCount?: number } = {};
  for (const change of changes) {
    if (change.field === "budget") {
      if (!/^\d{1,14}$/.test(change.after)) return { ok: false, message: "The new budget isn't a valid amount." };
      const minor = Number(change.after);
      if (minor <= 0 || minor > MAX_MINOR) return { ok: false, message: "The new budget must be more than zero." };
      values.budget = minor;
    } else if (change.field === "date") {
      if (!isIsoDate(change.after)) return { ok: false, message: "The new date isn't a real date." };
      if (daysBetween(today, change.after) <= 0) return { ok: false, message: "The new event date must be after today." };
      values.eventDate = change.after;
    } else {
      if (!/^\d{1,5}$/.test(change.after)) return { ok: false, message: "The new guest count isn't a whole number." };
      const guests = Number(change.after);
      if (guests < 1 || guests > 10_000) return { ok: false, message: "Guests must be between 1 and 10,000." };
      values.guestCount = guests;
    }
  }
  return { ok: true, ops: deterministicOpsFor(values) };
}

/** The stored value of a field, in the same canonical form as a change's `after`. */
export function currentValue(plan: EventPlan, field: ChangeField): string {
  if (field === "budget") return String(plan.budget);
  if (field === "date") return plan.eventDate;
  return String(plan.guestCount);
}

/** Changes as a proposal records them, keeping only fields whose value actually changes. */
export function constraintChanges(plan: EventPlan, changes: readonly ChangeInput[]): ConstraintChange[] {
  return changes
    .map((change) => ({ field: change.field, before: currentValue(plan, change.field), after: change.after }))
    .filter((change) => change.before !== change.after);
}
