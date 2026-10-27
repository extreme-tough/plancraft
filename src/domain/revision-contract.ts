import { z } from "zod";
import { parseAmount } from "./amount-parser";
import { summarizeBudget } from "./budget";
import { daysBetween, isIsoDate, type IsoDate } from "./dates";
import { findCycle } from "./graph";
import { lineGuests } from "./guests";
import { majorNumberToMinor, minorToMajor } from "./money";
import { AI_MONEY_MAX } from "./plan-contract";
import type { PlanOp, ProposalOption } from "./proposal";
import { computeSchedule } from "./schedule";
import { CategorySchema, EventTypeSchema, UseCaseSchema, type BudgetLine, type EventPlan, type Task } from "./schemas";

/**
 * The revision call's contract (spec §7.4): the request the server builds from the stored plan, the
 * response the model must return, the option rules R1–R8, and the mapping of the model's short
 * references back to real ids. Pure, so server and browser share it.
 */

const AiMoney = z.number().finite().min(0).max(AI_MONEY_MAX);
const IsoDateSchema = z.string().refine(isIsoDate, "Must be a calendar date (YYYY-MM-DD)");
const ChangeField = z.enum(["budget", "date", "guests"]);

/** What the browser sends to /api/ai/revise. The server builds RevisionRequest from the stored plan. */
export const ReviseInputSchema = z.strictObject({
  eventId: z.string().min(1).max(64),
  /** The plan version the proposal was built on (EM-56); the server refuses another. */
  baseVersion: z.number().int().nonnegative(),
  today: IsoDateSchema,
  changes: z.array(z.strictObject({ field: ChangeField, after: z.string().max(40) })).max(3),
  requestText: z.string().max(500).nullable(),
});
export type ReviseInput = z.infer<typeof ReviseInputSchema>;

export const RevisionRequestSchema = z.strictObject({
  event: z.strictObject({
    useCase: UseCaseSchema,
    eventType: EventTypeSchema,
    location: z.strictObject({ city: z.string(), country: z.string() }),
    eventDate: IsoDateSchema,
    today: IsoDateSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    budget: AiMoney,
    guestCount: z.number().int().min(1).max(10_000),
    answers: z.record(z.string(), z.unknown()),
  }),
  lines: z
    .array(
      z.strictObject({
        ref: z.string(),
        category: CategorySchema,
        name: z.string(),
        pricing: z.enum(["flat", "per_guest"]),
        guests: z.number().int().nullable(),
        /** Not in spec §7.4's JSON: tells the model (and R2) which lines set_guests may target. */
        ownGuests: z.boolean(),
        amount: AiMoney,
        label: z.enum(["ai_estimate", "vendor_quoted", "confirmed"]),
        locked: z.boolean(),
      }),
    )
    .max(60),
  tasks: z
    .array(
      z.strictObject({
        ref: z.string(),
        title: z.string(),
        line: z.string().nullable(),
        done: z.boolean(),
        deadline: IsoDateSchema,
        dependsOn: z.array(z.string()),
      }),
    )
    .max(80),
  changes: z.array(z.strictObject({ field: ChangeField, before: z.string().max(40), after: z.string().max(40) })).max(3),
  requestText: z.string().max(500).nullable(),
  shortfall: AiMoney,
});
export type RevisionRequest = z.infer<typeof RevisionRequestSchema>;

/** The model's short references for one plan: lines L1…, tasks T1… in stored order (spec §7.2.5). */
export interface Refs {
  lineRef: Map<string, string>;
  taskRef: Map<string, string>;
  lineId: Map<string, string>;
  taskId: Map<string, string>;
}

export function refsFor(plan: EventPlan): Refs {
  const lineRef = new Map(plan.lines.map((line, i) => [line.id, `L${i + 1}`]));
  const taskRef = new Map(plan.tasks.map((task, i) => [task.id, `T${i + 1}`]));
  return {
    lineRef,
    taskRef,
    lineId: new Map([...lineRef].map(([id, ref]) => [ref, id])),
    taskId: new Map([...taskRef].map(([id, ref]) => [ref, id])),
  };
}

/**
 * Builds the request from the plan **after** the code-built changes (spec §7.4). Confirmed lines
 * are marked locked (EM-42). Money goes out in major units; `shortfall` is calculated by code.
 */
export function revisionRequestFor(
  after: EventPlan,
  today: IsoDate,
  changes: RevisionRequest["changes"],
  requestText: string | null,
): RevisionRequest {
  const refs = refsFor(after);
  const major = (minor: number): number => minorToMajor(minor, after.currency);
  const schedule = computeSchedule(after, today);
  return {
    event: {
      useCase: after.useCase,
      eventType: after.eventType,
      location: { ...after.location },
      eventDate: after.eventDate,
      today,
      currency: after.currency,
      budget: major(after.budget),
      guestCount: after.guestCount,
      answers: { ...after.answers },
    },
    lines: after.lines.map((line) => ({
      ref: refs.lineRef.get(line.id) as string,
      category: line.category,
      name: line.name,
      pricing: line.pricing,
      guests: lineGuests(line, after.guestCount),
      ownGuests: line.guestSource === "own",
      amount: major(line.amount),
      label: line.label,
      locked: line.label === "confirmed",
    })),
    tasks: after.tasks.map((task) => ({
      ref: refs.taskRef.get(task.id) as string,
      title: task.title,
      line: task.lineId === null ? null : (refs.lineRef.get(task.lineId) ?? null),
      done: task.status === "done",
      deadline: schedule.get(task.id)?.deadline ?? after.eventDate,
      dependsOn: task.dependsOn.map((id) => refs.taskRef.get(id) as string),
    })),
    changes,
    requestText,
    shortfall: major(summarizeBudget(after).shortfall),
  };
}

const NewLineSchema = z.strictObject({
  key: z.string().regex(/^N[0-9]{1,2}$/),
  category: CategorySchema,
  name: z.string().min(1).max(80),
  pricing: z.enum(["flat", "per_guest"]),
  estimateLow: AiMoney,
  estimateHigh: AiMoney,
  assumptions: z.array(z.string().max(160)).min(1).max(3),
});

const NewTaskSchema = z.strictObject({
  key: z.string().regex(/^N[0-9]{1,2}$/),
  title: z.string().min(1).max(100),
  line: z.string().regex(/^(L|N)[0-9]{1,2}$/).nullable(),
  priority: z.enum(["high", "medium", "low"]),
  leadTimeDays: z.number().int().min(0).max(540),
  durationDays: z.number().int().min(1).max(90),
  dependsOn: z.array(z.string().regex(/^(T|N)[0-9]{1,2}$/)).max(5),
});

const AiOpSchema = z.strictObject({
  op: z.enum(["set_amount", "set_unit_cost", "set_guests", "remove_line", "add_line", "remove_task", "add_task", "set_lead_time"]),
  target: z.string().regex(/^(L|T)[0-9]{1,2}$/).nullable(),
  value: z.number().finite().nullable(),
  newLine: NewLineSchema.nullable(),
  newTask: NewTaskSchema.nullable(),
});
export type AiOp = z.infer<typeof AiOpSchema>;

const AiOptionSchema = z.strictObject({
  key: z.enum(["O1", "O2", "O3"]),
  title: z.string().min(1).max(80),
  rationale: z.string().max(300),
  ops: z.array(AiOpSchema).min(1).max(12),
  assumptions: z.array(z.string().max(200)).max(5),
});
export type AiOption = z.infer<typeof AiOptionSchema>;

export const RevisionResponseSchema = z.strictObject({
  interpretation: z.string().max(300),
  constraintChanges: z.array(z.strictObject({ field: ChangeField, value: z.string().max(40) })).max(3),
  options: z.array(AiOptionSchema).max(3),
  assumptions: z.array(z.string().max(200)).max(5),
});
export type RevisionResponse = z.infer<typeof RevisionResponseSchema>;

export type RevisionRuleId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8";

export const REVISION_RULES: Readonly<Record<RevisionRuleId, string>> = {
  R1: "Each operation has exactly the fields its op requires; unused fields are null.",
  R2: "Each target is an existing line or task of the right kind for the operation.",
  R3: "N# keys are unique within an option, and every N# reference resolves within that option.",
  R4: "No operation may target a line marked locked: true.",
  R5: "After an option's operations, task dependencies must not form a loop.",
  R6: "Options with identical operations are merged.",
  R7: "At least 2 options must remain when shortfall > 0, and at least 1 when requestText is set.",
  R8: "Each constraintChanges value must parse: a budget amount, a date after today, or 1–10,000 guests.",
};

const intIn = (value: number | null, min: number, max: number): boolean =>
  value !== null && Number.isInteger(value) && value >= min && value <= max;

/** Why one option must be dropped (R1–R5), or null if it may stay. */
export function optionProblem(option: AiOption, request: RevisionRequest): RevisionRuleId | null {
  const lines = new Map(request.lines.map((line) => [line.ref, line]));
  const tasks = new Map(request.tasks.map((task) => [task.ref, task]));
  const newKeys: string[] = [];
  const newLines = new Set<string>();
  const newTasks = new Set<string>();

  // R1: exactly the fields each op requires (spec §7.4 table).
  for (const op of option.ops) {
    const needsTarget = !["add_line", "add_task"].includes(op.op);
    const needsValue = !["remove_line", "remove_task", "add_task"].includes(op.op);
    if (needsTarget !== (op.target !== null) || needsValue !== (op.value !== null)) return "R1";
    if ((op.op === "add_line") !== (op.newLine !== null) || (op.op === "add_task") !== (op.newTask !== null)) return "R1";
    if (needsValue && (op.value as number) < 0) return "R1";
    if (op.op === "set_guests" && !intIn(op.value, 1, 10_000)) return "R1";
    if (op.op === "set_lead_time" && !intIn(op.value, 0, 540)) return "R1";
    if (op.newLine) {
      newKeys.push(op.newLine.key);
      newLines.add(op.newLine.key);
    }
    if (op.newTask) {
      newKeys.push(op.newTask.key);
      newTasks.add(op.newTask.key);
    }
  }

  // R2 and R4: targets exist, are the right kind, and aren't locked.
  for (const op of option.ops) {
    if (op.target === null) continue;
    if (op.target.startsWith("L")) {
      const line = lines.get(op.target);
      if (!line || !["set_amount", "set_unit_cost", "set_guests", "remove_line"].includes(op.op)) return "R2";
      if (line.locked) return "R4";
      if (op.op === "set_amount" && line.pricing !== "flat") return "R2";
      if (op.op === "set_unit_cost" && line.pricing !== "per_guest") return "R2";
      if (op.op === "set_guests" && !(line.pricing === "per_guest" && line.ownGuests)) return "R2";
    } else {
      const task = tasks.get(op.target);
      if (!task || !["remove_task", "set_lead_time"].includes(op.op)) return "R2";
      if (op.op === "remove_task" && task.done) return "R2";
    }
  }

  // R3: N# keys unique, and references to N# resolve within the option.
  if (new Set(newKeys).size !== newKeys.length) return "R3";
  for (const op of option.ops) {
    if (!op.newTask) continue;
    const { line, dependsOn } = op.newTask;
    if (line !== null && !(line.startsWith("L") ? lines.has(line) : newLines.has(line))) return "R3";
    if (dependsOn.some((ref) => (ref.startsWith("T") ? !tasks.has(ref) : !newTasks.has(ref) || ref === op.newTask?.key))) return "R3";
  }

  // R5: no loops once the option's tasks are added and removed.
  const removed = new Set(option.ops.filter((op) => op.op === "remove_task").map((op) => op.target as string));
  const graph = [
    ...request.tasks.filter((t) => !removed.has(t.ref)).map((t) => ({ id: t.ref, dependsOn: t.dependsOn.filter((d) => !removed.has(d)) })),
    ...option.ops.flatMap((op) => (op.newTask ? [{ id: op.newTask.key, dependsOn: op.newTask.dependsOn.filter((d) => !removed.has(d)) }] : [])),
  ];
  if (findCycle(graph)) return "R5";
  return null;
}

/** R8: a constraint change the user could confirm in the change form. */
export function constraintChangeValid(change: RevisionResponse["constraintChanges"][number], request: RevisionRequest): boolean {
  if (change.field === "budget") {
    const parsed = parseAmount(change.value, request.event.currency);
    return parsed.kind === "ok" && parsed.minor > 0;
  }
  if (change.field === "date") return isIsoDate(change.value) && daysBetween(request.event.today, change.value) > 0;
  return /^\d{1,5}$/.test(change.value) && Number(change.value) >= 1 && Number(change.value) <= 10_000;
}

/**
 * Applies the dropping rules: R1–R5 drop an option, R6 merges identical ones, R8 drops a constraint
 * change. What is left is what the browser may show.
 */
export function normalizeRevision(response: RevisionResponse, request: RevisionRequest): RevisionResponse {
  const seen = new Set<string>();
  const options = response.options.filter((option) => {
    if (optionProblem(option, request)) return false;
    const signature = JSON.stringify(option.ops);
    if (seen.has(signature)) return false; // R6
    seen.add(signature);
    return true;
  });
  return { ...response, options, constraintChanges: response.constraintChanges.filter((c) => constraintChangeValid(c, request)) };
}

/** R7, on the response as returned. On failure, also names why options were dropped, for the repair prompt. */
export function revisionRuleFailures(response: RevisionResponse, request: RevisionRequest): RevisionRuleId[] {
  const kept = normalizeRevision(response, request).options.length;
  const needed = request.shortfall > 0 ? 2 : request.requestText ? 1 : 0;
  if (kept >= needed) return [];
  const reasons = response.options.map((option) => optionProblem(option, request)).filter((r): r is RevisionRuleId => r !== null);
  return ["R7", ...new Set(reasons)].sort() as RevisionRuleId[];
}

/**
 * Turns the model's options into proposal options on real ids (spec §7.2.5). New lines start as AI
 * estimates and a new per-guest line follows the event count (§7.4); new tasks start not started.
 * `after` must be the same plan the request was built from, so the references line up.
 */
export function optionsFromResponse(response: RevisionResponse, after: EventPlan, newId: () => string): ProposalOption[] {
  const refs = refsFor(after);
  const toMinor = (major: number): number => majorNumberToMinor(major, after.currency);
  return response.options.map((option) => {
    const newIds = new Map<string, string>();
    for (const op of option.ops) {
      if (op.newLine) newIds.set(op.newLine.key, newId());
      if (op.newTask) newIds.set(op.newTask.key, newId());
    }
    const lineIdOf = (ref: string): string => (ref.startsWith("N") ? newIds.get(ref) : refs.lineId.get(ref)) as string;
    const taskIdOf = (ref: string): string => (ref.startsWith("N") ? newIds.get(ref) : refs.taskId.get(ref)) as string;

    const ops: PlanOp[] = option.ops.map((op): PlanOp => {
      switch (op.op) {
        case "set_amount":
        case "set_unit_cost":
          return { op: op.op, lineId: lineIdOf(op.target as string), value: toMinor(op.value as number) };
        case "set_guests":
          return { op: "set_guests", lineId: lineIdOf(op.target as string), value: op.value as number };
        case "remove_line":
          return { op: "remove_line", lineId: lineIdOf(op.target as string) };
        case "remove_task":
          return { op: "remove_task", taskId: taskIdOf(op.target as string) };
        case "set_lead_time":
          return { op: "set_lead_time", taskId: taskIdOf(op.target as string), value: op.value as number };
        case "add_line": {
          const spec = op.newLine as NonNullable<AiOp["newLine"]>;
          const perGuest = spec.pricing === "per_guest";
          const value = toMinor(op.value as number);
          const line: BudgetLine = {
            id: newIds.get(spec.key) as string,
            category: spec.category,
            name: spec.name,
            partId: null,
            pricing: spec.pricing,
            guestSource: perGuest ? "event" : null,
            ownGuests: null,
            unitCost: perGuest ? value : null,
            amount: perGuest ? value * after.guestCount : value,
            label: "ai_estimate",
            quoteId: null,
            estimate: { low: toMinor(spec.estimateLow), high: toMinor(spec.estimateHigh) },
            assumptions: spec.assumptions,
            vendorNeeds: [],
            vendorQuestions: [],
            payment: null,
          };
          return { op: "add_line", line };
        }
        case "add_task": {
          const spec = op.newTask as NonNullable<AiOp["newTask"]>;
          const task: Task = {
            id: newIds.get(spec.key) as string,
            title: spec.title,
            lineId: spec.line === null ? null : lineIdOf(spec.line),
            priority: spec.priority,
            leadTimeDays: spec.leadTimeDays,
            durationDays: spec.durationDays,
            dependsOn: spec.dependsOn.map(taskIdOf),
            status: "not_started",
          };
          return { op: "add_task", task };
        }
      }
    });
    return { key: option.key, title: option.title, rationale: option.rationale, ops, assumptions: option.assumptions };
  });
}

