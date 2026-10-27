import { DomainError } from "./errors";
import { dependentsOf, describeCycle, findCycle } from "./graph";
import { syncPerGuestAmounts } from "./guests";
import { transitionLabel } from "./labels";
import type { Minor } from "./money";
import { EventPlanSchema, type BudgetLine, type Category, type EventPlan, type Task } from "./schemas";

/**
 * The user's own edits on the dashboard (EM-13, EM-16, EM-20, EM-22, EM-24). Each returns a new
 * plan and never touches anything else; the caller saves it through the version-checked write
 * (EM-62). No AI is involved, and nothing here cuts lines on its own (EM-18).
 */

export interface LineInput {
  name: string;
  category: Category;
  pricing: "flat" | "per_guest";
  /** Flat lines: the amount. Ignored for per-guest lines. */
  amount: Minor;
  /** Per-guest lines: the price per guest. Ignored for flat lines. */
  unitCost: Minor;
  /** Per-guest lines: follow the event's guest count, or the line's own. */
  guestSource: "event" | "own";
  ownGuests: number | null;
}

export interface TaskInput {
  title: string;
  priority: Task["priority"];
  leadTimeDays: number;
  durationDays: number;
  dependsOn: string[];
  lineId: string | null;
}

/** Re-derives per-guest amounts (INV-9), refuses loops by name (EM-45) and re-checks the schema. */
function finish(next: EventPlan): EventPlan {
  const synced = syncPerGuestAmounts(next);
  const cycle = findCycle(synced.tasks);
  if (cycle) {
    const titles = new Map(synced.tasks.map((t) => [t.id, t.title]));
    throw new DomainError("dependency_cycle", `That would create a loop: ${describeCycle(cycle, (id) => titles.get(id) ?? id)}.`);
  }
  const checked = EventPlanSchema.safeParse(synced);
  if (!checked.success) throw new DomainError("invalid_value", checked.error.issues[0]?.message ?? "That change isn't valid.");
  return checked.data;
}

function line(plan: EventPlan, lineId: string): BudgetLine {
  const found = plan.lines.find((l) => l.id === lineId);
  if (!found) throw new DomainError("not_found", "That budget line no longer exists.");
  return found;
}

function task(plan: EventPlan, taskId: string): Task {
  const found = plan.tasks.find((t) => t.id === taskId);
  if (!found) throw new DomainError("not_found", "That task no longer exists.");
  return found;
}

function priced(base: BudgetLine, input: LineInput): BudgetLine {
  const name = input.name.trim();
  if (name === "") throw new DomainError("invalid_value", "Enter a name for the line.");
  if (input.pricing === "flat") {
    return { ...base, name, category: input.category, pricing: "flat", guestSource: null, ownGuests: null, unitCost: null, amount: input.amount };
  }
  const own = input.guestSource === "own";
  if (own && (input.ownGuests === null || input.ownGuests < 1)) throw new DomainError("invalid_value", "Enter how many guests this line is for.");
  return {
    ...base,
    name,
    category: input.category,
    pricing: "per_guest",
    guestSource: input.guestSource,
    ownGuests: own ? input.ownGuests : null,
    unitCost: input.unitCost,
    // finish() sets amount = unit cost × guests.
    amount: base.amount,
  };
}

/** EM-13: a new line. User-added lines start as estimates, like every unconfirmed line (EM-41). */
export function addLine(plan: EventPlan, id: string, input: LineInput): EventPlan {
  const blank: BudgetLine = {
    id,
    category: input.category,
    name: input.name,
    partId: null,
    pricing: "flat",
    guestSource: null,
    ownGuests: null,
    unitCost: null,
    amount: 0,
    label: "ai_estimate",
    quoteId: null,
    estimate: null,
    assumptions: [],
    vendorNeeds: [],
    vendorQuestions: [],
    payment: null,
  };
  return finish({ ...plan, lines: [...plan.lines, priced(blank, input)] });
}

/**
 * EM-13, EM-16: rename, recategorise or reprice a line. A confirmed line can be renamed or moved to
 * another category, but its price only changes after the user un-confirms it (EM-20, EM-42).
 */
export function updateLine(plan: EventPlan, lineId: string, input: LineInput): EventPlan {
  const current = line(plan, lineId);
  const next = priced(current, input);
  if (current.label === "confirmed") {
    const repriced =
      next.pricing !== current.pricing ||
      next.guestSource !== current.guestSource ||
      next.ownGuests !== current.ownGuests ||
      (next.pricing === "flat" ? next.amount !== current.amount : next.unitCost !== current.unitCost);
    if (repriced) throw new DomainError("locked_line", `"${current.name}" is confirmed. Un-confirm it to change its price.`);
  }
  return finish({ ...plan, lines: plan.lines.map((l) => (l.id === lineId ? next : l)) });
}

/** EM-13. A confirmed line has to be un-confirmed first; its tasks stay, unlinked. */
export function removeLine(plan: EventPlan, lineId: string): EventPlan {
  const current = line(plan, lineId);
  if (current.label === "confirmed") throw new DomainError("locked_line", `"${current.name}" is confirmed. Un-confirm it before deleting it.`);
  return finish({
    ...plan,
    lines: plan.lines.filter((l) => l.id !== lineId),
    tasks: plan.tasks.map((t) => (t.lineId === lineId ? { ...t, lineId: null } : t)),
  });
}

/** EM-20, EM-41: only the user confirms, and only a line with an amount. */
export function confirmLine(plan: EventPlan, lineId: string): EventPlan {
  const current = line(plan, lineId);
  if (current.amount <= 0) throw new DomainError("invalid_value", "Add an amount before confirming this line.");
  const next = transitionLabel(current, { type: "confirm" }, plan.guestCount);
  return finish({ ...plan, lines: plan.lines.map((l) => (l.id === lineId ? next : l)) });
}

export function unconfirmLine(plan: EventPlan, lineId: string): EventPlan {
  const next = transitionLabel(line(plan, lineId), { type: "unconfirm" }, plan.guestCount);
  return finish({ ...plan, lines: plan.lines.map((l) => (l.id === lineId ? next : l)) });
}

function taskFrom(id: string, input: TaskInput, status: Task["status"]): Task {
  const title = input.title.trim();
  if (title === "") throw new DomainError("invalid_value", "Enter a title for the task.");
  return {
    id,
    title,
    lineId: input.lineId,
    priority: input.priority,
    leadTimeDays: input.leadTimeDays,
    durationDays: input.durationDays,
    dependsOn: [...new Set(input.dependsOn)],
    status,
  };
}

/** EM-22. */
export function addTask(plan: EventPlan, id: string, input: TaskInput): EventPlan {
  return finish({ ...plan, tasks: [...plan.tasks, taskFrom(id, input, "not_started")] });
}

/** EM-22, EM-23, EM-45: a dependency change that would close a loop is refused, naming the loop. */
export function updateTask(plan: EventPlan, taskId: string, input: TaskInput): EventPlan {
  const current = task(plan, taskId);
  const next = taskFrom(taskId, input, current.status);
  return finish({ ...plan, tasks: plan.tasks.map((t) => (t.id === taskId ? next : t)) });
}

/** EM-22, EM-24: done, in progress, or back to not started. Dependents' availability is calculated on read. */
export function setTaskStatus(plan: EventPlan, taskId: string, status: Task["status"]): EventPlan {
  task(plan, taskId);
  return finish({ ...plan, tasks: plan.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) });
}

/** EM-22. Other tasks stop depending on it. */
export function removeTask(plan: EventPlan, taskId: string): EventPlan {
  task(plan, taskId);
  return finish({
    ...plan,
    tasks: plan.tasks.filter((t) => t.id !== taskId).map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => d !== taskId) })),
  });
}

/**
 * EM-45, layer 3: the tasks that can't be picked as dependencies of `taskId`, because they already
 * wait for it (directly or not) or are the task itself. The picker greys these out.
 */
export function unpickableDependencies(plan: EventPlan, taskId: string | null): Set<string> {
  if (taskId === null) return new Set();
  const blocked = dependentsOf(plan.tasks, taskId);
  blocked.add(taskId);
  return blocked;
}
