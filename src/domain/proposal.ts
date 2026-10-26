import { z } from "zod";
import { deepEqual } from "./equal";
import { DomainError } from "./errors";
import { describeCycle, findCycle } from "./graph";
import { syncPerGuestAmounts } from "./guests";
import {
  BudgetLineSchema,
  EventPlanSchema,
  GuestCountSchema,
  IdSchema,
  IsoDateSchema,
  MinorSchema,
  TaskSchema,
  type BudgetLine,
  type EventPlan,
} from "./schemas";

/**
 * Proposals: revisions and scenarios (EM-15, EM-52 to EM-56, spec §8.6). A proposal is stored apart
 * from the plan, so creating or discarding one never touches the plan (INV-4). Apply checks the
 * plan version, applies every op to a copy, checks the invariants, then returns the new plan.
 */

const NonNegativeMinor = MinorSchema.refine((v) => v >= 0, "Can't be negative");

/** Event-level ops exist only for code-built changes; the AI op schema can't express them (§7.4). */
export const EventOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_event_budget"), value: NonNegativeMinor.refine((v) => v > 0) }),
  z.object({ op: z.literal("set_event_date"), value: IsoDateSchema }),
  z.object({ op: z.literal("set_event_guests"), value: GuestCountSchema }),
]);

/** Line and task ops, as proposed by the AI (after its N# keys are mapped to ids) or by code. */
export const PlanOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_amount"), lineId: IdSchema, value: NonNegativeMinor }),
  z.object({ op: z.literal("set_unit_cost"), lineId: IdSchema, value: NonNegativeMinor }),
  z.object({ op: z.literal("set_guests"), lineId: IdSchema, value: GuestCountSchema }),
  z.object({ op: z.literal("remove_line"), lineId: IdSchema }),
  z.object({ op: z.literal("add_line"), line: BudgetLineSchema }),
  z.object({ op: z.literal("remove_task"), taskId: IdSchema }),
  z.object({ op: z.literal("add_task"), task: TaskSchema }),
  z.object({ op: z.literal("set_lead_time"), taskId: IdSchema, value: z.number().int().min(0).max(540) }),
]);

export const OpSchema = z.union([EventOpSchema, PlanOpSchema]);
export type EventOp = z.infer<typeof EventOpSchema>;
export type PlanOp = z.infer<typeof PlanOpSchema>;
export type Op = z.infer<typeof OpSchema>;

export const ConstraintChangeSchema = z.object({
  field: z.enum(["budget", "date", "guests"]),
  before: z.string().max(40),
  after: z.string().max(40),
});
export type ConstraintChange = z.infer<typeof ConstraintChangeSchema>;

export const ProposalOptionSchema = z.object({
  key: z.enum(["O1", "O2", "O3"]),
  title: z.string().min(1).max(80),
  rationale: z.string().max(300),
  ops: z.array(PlanOpSchema).min(1).max(12),
  assumptions: z.array(z.string().max(200)).max(5),
});
export type ProposalOption = z.infer<typeof ProposalOptionSchema>;

export const ProposalSchema = z.object({
  id: IdSchema,
  eventId: IdSchema,
  kind: z.enum(["revision", "scenario"]),
  /** Scenarios only. */
  name: z.string().max(60).nullable(),
  /** The plan version this proposal was calculated from (EM-56). */
  baseVersion: z.number().int().nonnegative(),
  changes: z.array(ConstraintChangeSchema).max(3),
  requestText: z.string().max(500).nullable(),
  deterministicOps: z.array(OpSchema).max(20),
  options: z.array(ProposalOptionSchema).max(3),
  interpretation: z.string().max(300).nullable(),
  assumptions: z.array(z.string().max(200)).max(5),
  selectedOption: z.enum(["O1", "O2", "O3"]).nullable(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

function findLine(plan: EventPlan, lineId: string): BudgetLine {
  const line = plan.lines.find((l) => l.id === lineId);
  if (!line) throw new DomainError("not_found", `No budget line ${lineId}`);
  return line;
}

function replaceLine(plan: EventPlan, line: BudgetLine): EventPlan {
  return { ...plan, lines: plan.lines.map((l) => (l.id === line.id ? line : l)) };
}

/** A plan op may never touch a confirmed line (EM-42, rule R4). */
function assertUnlocked(line: BudgetLine): void {
  if (line.label === "confirmed") throw new DomainError("locked_line", `"${line.name}" is confirmed and can't change`);
}

/** Applies one op to a plan, returning a new plan. Throws DomainError on any broken rule. */
export function applyOp(plan: EventPlan, op: Op): EventPlan {
  switch (op.op) {
    case "set_event_budget":
      return { ...plan, budget: op.value };
    case "set_event_date":
      return { ...plan, eventDate: op.value };
    case "set_event_guests":
      return { ...plan, guestCount: op.value };

    case "set_amount": {
      const line = findLine(plan, op.lineId);
      assertUnlocked(line);
      if (line.pricing !== "flat") throw new DomainError("wrong_target", "set_amount needs a flat line");
      return replaceLine(plan, { ...line, amount: op.value });
    }
    case "set_unit_cost": {
      const line = findLine(plan, op.lineId);
      assertUnlocked(line);
      if (line.pricing !== "per_guest") throw new DomainError("wrong_target", "set_unit_cost needs a per-guest line");
      return replaceLine(plan, { ...line, unitCost: op.value });
    }
    case "set_guests": {
      const line = findLine(plan, op.lineId);
      assertUnlocked(line);
      if (line.guestSource !== "own") {
        throw new DomainError("wrong_target", "set_guests needs a line with its own guest count");
      }
      return replaceLine(plan, { ...line, ownGuests: op.value });
    }
    case "remove_line": {
      const line = findLine(plan, op.lineId);
      assertUnlocked(line);
      return {
        ...plan,
        lines: plan.lines.filter((l) => l.id !== line.id),
        tasks: plan.tasks.map((t) => (t.lineId === line.id ? { ...t, lineId: null } : t)),
      };
    }
    case "add_line": {
      if (plan.lines.some((l) => l.id === op.line.id)) throw new DomainError("invalid_value", "Line id already used");
      if (op.line.label !== "ai_estimate") throw new DomainError("invalid_value", "New lines start as estimates");
      return { ...plan, lines: [...plan.lines, op.line] };
    }
    case "remove_task": {
      const task = plan.tasks.find((t) => t.id === op.taskId);
      if (!task) throw new DomainError("not_found", `No task ${op.taskId}`);
      if (task.status === "done") throw new DomainError("task_done", "A finished task can't be removed");
      return {
        ...plan,
        tasks: plan.tasks
          .filter((t) => t.id !== task.id)
          .map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => d !== task.id) })),
      };
    }
    case "add_task": {
      if (plan.tasks.some((t) => t.id === op.task.id)) throw new DomainError("invalid_value", "Task id already used");
      return { ...plan, tasks: [...plan.tasks, op.task] };
    }
    case "set_lead_time": {
      const task = plan.tasks.find((t) => t.id === op.taskId);
      if (!task) throw new DomainError("not_found", `No task ${op.taskId}`);
      return { ...plan, tasks: plan.tasks.map((t) => (t.id === task.id ? { ...t, leadTimeDays: op.value } : t)) };
    }
  }
}

/**
 * Applies ops to a copy and checks the result. Per-guest amounts are re-derived (INV-9), loops are
 * refused with the loop named (EM-45), and the plan must still pass its schema. All or nothing.
 */
export function applyOps(plan: EventPlan, ops: readonly Op[]): EventPlan {
  let next = plan;
  for (const op of ops) next = applyOp(next, op);
  next = syncPerGuestAmounts(next);

  const cycle = findCycle(next.tasks);
  if (cycle) {
    const titles = new Map(next.tasks.map((t) => [t.id, t.title]));
    throw new DomainError("dependency_cycle", `That would create a loop: ${describeCycle(cycle, (id) => titles.get(id) ?? id)}`);
  }
  const checked = EventPlanSchema.safeParse(next);
  if (!checked.success) {
    throw new DomainError("invalid_plan", checked.error.issues.map((i) => i.message).join("; "));
  }
  return checked.data;
}

/** EM-56: a proposal built on an older version of the plan can't be applied. */
export function isStale(proposal: Pick<Proposal, "baseVersion">, plan: Pick<EventPlan, "version">): boolean {
  return proposal.baseVersion !== plan.version;
}

/** The ops a proposal would apply: code-built changes, then the selected option's ops (if any). */
export function proposalOps(proposal: Proposal): Op[] {
  const option = proposal.options.find((o) => o.key === proposal.selectedOption);
  return [...proposal.deterministicOps, ...(option?.ops ?? [])];
}

/**
 * Apply (EM-53, EM-54). Refuses a stale proposal (EM-56), applies everything to a copy, and asserts
 * confirmed lines are exactly unchanged (EM-42, INV-2). Returns the new plan with version + 1;
 * on any failure it throws and the caller keeps the old plan (INV-10).
 */
export function applyProposal(plan: EventPlan, proposal: Proposal): EventPlan {
  if (isStale(proposal, plan)) {
    throw new DomainError("stale_proposal", "The plan changed since this proposal. Recalculate it first.");
  }
  const next = applyOps(plan, proposalOps(proposal));
  assertConfirmedUnchanged(plan, next);
  return { ...next, version: plan.version + 1 };
}

export function assertConfirmedUnchanged(before: EventPlan, after: EventPlan): void {
  const afterById = new Map(after.lines.map((line) => [line.id, line]));
  for (const line of before.lines) {
    if (line.label !== "confirmed") continue;
    const now = afterById.get(line.id);
    if (!now || !deepEqual(now, line)) {
      throw new DomainError("confirmed_changed", `Confirmed line "${line.name}" would change`);
    }
  }
}

/**
 * The code-built half of a revision (spec §7, EM-17, EM-27): budget, date and guest-count changes.
 * Per-guest recalculation follows in applyOps; no AI is involved.
 */
export function deterministicOpsFor(changes: { budget?: number; eventDate?: string; guestCount?: number }): EventOp[] {
  const ops: EventOp[] = [];
  if (changes.budget !== undefined) ops.push({ op: "set_event_budget", value: changes.budget });
  if (changes.eventDate !== undefined) ops.push({ op: "set_event_date", value: changes.eventDate });
  if (changes.guestCount !== undefined) ops.push({ op: "set_event_guests", value: changes.guestCount });
  return ops;
}
