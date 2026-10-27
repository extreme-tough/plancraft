import { z } from "zod";
import { daysBetween, isIsoDate } from "./dates";
import { findCycle } from "./graph";
import { isSupportedCurrency } from "./money";
import { CategorySchema, UseCaseSchema, EventTypeSchema } from "./schemas";

/**
 * The plan call's contract (spec §7.3): what the browser sends, what the model must return, and the
 * rules code checks before anything is used (AI-11). Pure, so the server and the browser validate
 * with exactly the same code.
 */

/** Money in AI payloads: a JSON number in major units of the event currency (spec §7.2.4). */
export const AI_MONEY_MAX = 1e11;
const AiMoney = z.number().finite().min(0).max(AI_MONEY_MAX);
const IsoDate = z.string().refine(isIsoDate, "Must be a calendar date (YYYY-MM-DD)");
const Guests = z.number().int().min(1).max(10_000);

export const PlanRequestSchema = z.strictObject({
  useCase: UseCaseSchema,
  eventType: EventTypeSchema,
  occasion: z.string().min(1).max(120),
  location: z.strictObject({ city: z.string().min(1).max(80), country: z.string().regex(/^[A-Z]{2}$/) }),
  eventDate: IsoDate,
  today: IsoDate,
  currency: z.string().regex(/^[A-Z]{3}$/),
  budget: AiMoney.refine((v) => v > 0, "Budget must be above zero"),
  guestCount: Guests,
  parts: z.array(z.strictObject({ name: z.string().min(1).max(60), guestCount: Guests })).max(4),
  answers: z.strictObject({
    priorities: z.array(CategorySchema).min(1).max(3),
    mustHaves: z.array(z.string().max(120)).max(5).optional(),
    experience: z.enum(["first_time", "some", "experienced"]).optional(),
    atmosphere: z.string().max(120).optional(),
    ageGroups: z.array(z.enum(["children", "teens", "adults", "seniors"])).max(4).optional(),
    cultural: z.string().max(300).optional(),
    accessibility: z.string().max(300).optional(),
    venueConstraints: z.string().max(300).optional(),
  }),
  description: z.string().max(2000),
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

/**
 * Server-side request rules (spec §7.3): a real currency, an event after today, a "today" within
 * a day of the server's own date (time zones differ, so ±1), and unique part names.
 * Returns a message for the 400, or null.
 */
export function planRequestProblem(request: PlanRequest, serverUtcDate: string): string | null {
  if (!isSupportedCurrency(request.currency)) return "Unknown currency.";
  if (Math.abs(daysBetween(serverUtcDate, request.today)) > 1) return "Today's date doesn't match the server's.";
  if (daysBetween(request.today, request.eventDate) <= 0) return "The event date must be after today.";
  const names = request.parts.map((part) => part.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "Part names must be unique.";
  return null;
}

const LineKey = z.string().regex(/^L[0-9]{1,2}$/);
const TaskKey = z.string().regex(/^T[0-9]{1,2}$/);

export const PlanLineSchema = z.strictObject({
  key: LineKey,
  category: CategorySchema,
  name: z.string().min(1).max(80),
  part: z.string().max(60).nullable(),
  pricing: z.enum(["flat", "per_guest"]),
  weight: z.number().gt(0).max(100),
  /** Per guest for per-guest lines, the line total for flat lines (spec §7.3). */
  estimateLow: AiMoney,
  estimateHigh: AiMoney,
  assumptions: z.array(z.string().max(160)).min(1).max(3),
  vendorNeeds: z.array(z.string().max(120)).max(5),
  vendorQuestions: z.array(z.string().max(160)).max(5),
});

export const PlanTaskSchema = z.strictObject({
  key: TaskKey,
  title: z.string().min(1).max(100),
  line: LineKey.nullable(),
  priority: z.enum(["high", "medium", "low"]),
  leadTimeDays: z.number().int().min(0).max(540),
  durationDays: z.number().int().min(1).max(90),
  dependsOn: z
    .array(TaskKey)
    .max(5)
    .refine((keys) => new Set(keys).size === keys.length, "Dependencies must be unique"),
});

export const PlanResponseSchema = z.strictObject({
  summary: z.string().max(400),
  budgetLines: z.array(PlanLineSchema).min(3).max(25),
  tasks: z.array(PlanTaskSchema).min(5).max(40),
  assumptions: z.array(z.string().max(200)).min(1).max(10),
  openQuestions: z.array(z.string().max(200)).max(5),
});
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

export type PlanRuleId = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8";

/** What each rule means, sent back to the model on the repair attempt (spec §7.2.8). */
export const PLAN_RULES: Readonly<Record<PlanRuleId, string>> = {
  P1: "Line keys and task keys must each be unique.",
  P2: "Each task's `line` must be an existing line key, or null.",
  P3: "Each `dependsOn` entry must be an existing task key, and never the task itself.",
  P4: "Task dependencies must not form a loop.",
  P5: "A line's `part` must be null or exactly the name of one of the event's parts.",
  P6: "`estimateHigh` must be at least `estimateLow`.",
  P7: "There may be at most one line in the `contingency` category.",
  P8: "At least one line must be in a category from `answers.priorities`.",
};

/** P1–P8 (spec §7.3). Any failure invalidates the whole response: there is no partial plan. */
export function planRuleFailures(response: PlanResponse, request: PlanRequest): PlanRuleId[] {
  const failures = new Set<PlanRuleId>();
  const lineKeys = response.budgetLines.map((line) => line.key);
  const taskKeys = response.tasks.map((task) => task.key);
  if (new Set(lineKeys).size !== lineKeys.length || new Set(taskKeys).size !== taskKeys.length) failures.add("P1");

  const lines = new Set(lineKeys);
  const tasks = new Set(taskKeys);
  for (const task of response.tasks) {
    if (task.line !== null && !lines.has(task.line)) failures.add("P2");
    if (task.dependsOn.some((key) => key === task.key || !tasks.has(key))) failures.add("P3");
  }
  // Loops are only meaningful once every reference resolves.
  if (!failures.has("P1") && !failures.has("P3")) {
    if (findCycle(response.tasks.map((task) => ({ id: task.key, dependsOn: task.dependsOn })))) failures.add("P4");
  }

  const partNames = new Set(request.parts.map((part) => part.name));
  for (const line of response.budgetLines) {
    if (line.part !== null && !partNames.has(line.part)) failures.add("P5");
    if (line.estimateHigh < line.estimateLow) failures.add("P6");
  }
  if (response.budgetLines.filter((line) => line.category === "contingency").length > 1) failures.add("P7");
  if (!response.budgetLines.some((line) => request.answers.priorities.includes(line.category))) failures.add("P8");

  return [...failures].sort();
}
