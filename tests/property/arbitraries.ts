import fc from "fast-check";
import { CATEGORIES, type BudgetLine, type EventPlan, type Task } from "@/domain/schemas";
import type { Op } from "@/domain/proposal";
import { makePlan } from "../support/factories";

/** Random but always-valid plans, and random op sequences that may or may not be legal. */

export const TODAY = "2026-10-25";

const arbLabel = fc.constantFrom("ai_estimate", "vendor_quoted", "confirmed") as fc.Arbitrary<BudgetLine["label"]>;

function arbLine(id: string, eventGuests: number): fc.Arbitrary<BudgetLine> {
  return fc
    .record({
      category: fc.constantFrom(...CATEGORIES),
      kind: fc.constantFrom("flat", "event", "own"),
      ownGuests: fc.integer({ min: 1, max: 500 }),
      unitCost: fc.integer({ min: 0, max: 500_000 }),
      amount: fc.integer({ min: 0, max: 50_000_000 }),
      label: arbLabel,
    })
    .map(({ category, kind, ownGuests, unitCost, amount, label }): BudgetLine => {
      const perGuest = kind !== "flat";
      const guests = kind === "own" ? ownGuests : eventGuests;
      return {
        id,
        category,
        name: `Line ${id}`,
        partId: null,
        pricing: perGuest ? "per_guest" : "flat",
        guestSource: kind === "flat" ? null : (kind as "event" | "own"),
        ownGuests: kind === "own" ? ownGuests : null,
        unitCost: perGuest ? unitCost : null,
        // Confirmed per-guest lines may be frozen at any amount; the rest stay in sync (INV-9).
        amount: perGuest && label !== "confirmed" ? unitCost * guests : amount,
        label,
        quoteId: label === "vendor_quoted" ? `q-${id}` : null,
        estimate: null,
        assumptions: [],
        vendorNeeds: [],
        vendorQuestions: [],
        payment: null,
      };
    });
}

function arbTasks(count: number): fc.Arbitrary<Task[]> {
  // Each task may depend only on earlier tasks, so the generated graph never has a loop.
  return fc.tuple(
    ...Array.from({ length: count }, (_, i) =>
      fc.record({
        leadTimeDays: fc.integer({ min: 0, max: 540 }),
        durationDays: fc.integer({ min: 1, max: 90 }),
        priority: fc.constantFrom("high", "medium", "low"),
        status: fc.constantFrom("not_started", "in_progress", "done"),
        dependsOn: i === 0 ? fc.constant<number[]>([]) : fc.uniqueArray(fc.integer({ min: 0, max: i - 1 }), { maxLength: 3 }),
      }),
    ),
  ).map((specs) =>
    specs.map(
      (spec, i): Task => ({
        id: `t${i}`,
        title: `Task ${i}`,
        lineId: null,
        priority: spec.priority as Task["priority"],
        leadTimeDays: spec.leadTimeDays,
        durationDays: spec.durationDays,
        dependsOn: spec.dependsOn.map((d) => `t${d}`),
        status: spec.status as Task["status"],
      }),
    ),
  );
}

export const arbPlan: fc.Arbitrary<EventPlan> = fc
  .record({
    guestCount: fc.integer({ min: 1, max: 2_000 }),
    budget: fc.integer({ min: 1, max: 1_000_000_000 }),
    daysOut: fc.integer({ min: 1, max: 400 }),
    lineCount: fc.integer({ min: 0, max: 8 }),
    taskCount: fc.integer({ min: 0, max: 8 }),
  })
  .chain(({ guestCount, budget, daysOut, lineCount, taskCount }) =>
    fc
      .tuple(
        fc.tuple(...Array.from({ length: lineCount }, (_, i) => arbLine(`l${i}`, guestCount))),
        arbTasks(taskCount),
      )
      .map(([lines, tasks]) =>
        makePlan({ guestCount, budget, eventDate: addDays(TODAY, daysOut), lines, tasks }),
      ),
  );

/** Ops aimed at the plan's real ids (and a few ghosts), legal or not. */
export function arbOps(plan: EventPlan): fc.Arbitrary<Op[]> {
  const lineIds = [...plan.lines.map((l) => l.id), "ghost"];
  const taskIds = [...plan.tasks.map((t) => t.id), "ghost"];
  const arbOp: fc.Arbitrary<Op> = fc.oneof(
    fc.integer({ min: 1, max: 1_000_000_000 }).map((value): Op => ({ op: "set_event_budget", value })),
    fc.integer({ min: -60, max: 60 }).map((d): Op => ({ op: "set_event_date", value: addDays(plan.eventDate, d) })),
    fc.integer({ min: 1, max: 2_000 }).map((value): Op => ({ op: "set_event_guests", value })),
    fc.record({ lineId: fc.constantFrom(...lineIds), value: fc.integer({ min: 0, max: 50_000_000 }) }).map((r): Op => ({ op: "set_amount", ...r })),
    fc.record({ lineId: fc.constantFrom(...lineIds), value: fc.integer({ min: 0, max: 500_000 }) }).map((r): Op => ({ op: "set_unit_cost", ...r })),
    fc.record({ lineId: fc.constantFrom(...lineIds), value: fc.integer({ min: 1, max: 500 }) }).map((r): Op => ({ op: "set_guests", ...r })),
    fc.constantFrom(...lineIds).map((lineId): Op => ({ op: "remove_line", lineId })),
    fc.constantFrom(...taskIds).map((taskId): Op => ({ op: "remove_task", taskId })),
    fc.record({ taskId: fc.constantFrom(...taskIds), value: fc.integer({ min: 0, max: 540 }) }).map((r): Op => ({ op: "set_lead_time", ...r })),
    fc.integer({ min: 0, max: 5_000_000 }).map(
      (amount): Op => ({
        op: "add_line",
        line: { ...plan.lines[0], ...newFlatLine(`new-${amount}`, amount) },
      }),
    ),
    fc.uniqueArray(fc.constantFrom(...taskIds), { maxLength: 2 }).map(
      (dependsOn): Op => ({
        op: "add_task",
        task: { id: `new-task-${dependsOn.join("-")}`, title: "New", lineId: null, priority: "low", leadTimeDays: 10, durationDays: 2, dependsOn, status: "not_started" },
      }),
    ),
  );
  return fc.array(arbOp, { maxLength: 6 });
}

function newFlatLine(id: string, amount: number): BudgetLine {
  return {
    id,
    category: "other",
    name: "New line",
    partId: null,
    pricing: "flat",
    guestSource: null,
    ownGuests: null,
    unitCost: null,
    amount,
    label: "ai_estimate",
    quoteId: null,
    estimate: null,
    assumptions: [],
    vendorNeeds: [],
    vendorQuestions: [],
    payment: null,
  };
}

export function addDays(date: string, days: number): string {
  const ms = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}
