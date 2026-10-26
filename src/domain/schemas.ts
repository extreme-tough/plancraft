import { z } from "zod";
import { isIsoDate } from "./dates";
import { findCycle } from "./graph";
import { isMinor, isSupportedCurrency } from "./money";

/**
 * Stored shapes for an event plan (spec §8.5, plan §3). Zod is the single source of truth for the
 * TypeScript types, runtime checks on every read and write, and the Firestore rules' expectations.
 * Calculated values (remaining, deadlines, statuses, alerts) are never stored.
 */

export const MinorSchema = z.number().refine(isMinor, "Must be an integer number of minor units");
export const IsoDateSchema = z.string().refine(isIsoDate, "Must be a calendar date (YYYY-MM-DD)");
export const CurrencySchema = z.string().refine(isSupportedCurrency, "Must be an ISO 4217 currency");
export const IdSchema = z.string().min(1).max(64);
export const GuestCountSchema = z.number().int().min(1).max(10_000);

export const CATEGORIES = [
  "venue",
  "catering",
  "decoration",
  "photography",
  "entertainment",
  "attire",
  "invitations",
  "transport",
  "permits",
  "contingency",
  "other",
] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const UseCaseSchema = z.enum(["small_celebration", "wedding", "community"]);
export const EventTypeSchema = z.enum([
  "birthday",
  "milestone_birthday",
  "anniversary",
  "wedding",
  "community_gathering",
  "other",
]);
export const LabelSchema = z.enum(["ai_estimate", "vendor_quoted", "confirmed"]);
export type CostLabel = z.infer<typeof LabelSchema>;

export const OnboardingAnswersSchema = z.object({
  priorities: z.array(CategorySchema).min(1).max(3),
  mustHaves: z.array(z.string().max(120)).max(5),
  experience: z.enum(["first_time", "some", "experienced"]).nullable(),
  atmosphere: z.string().max(120),
  ageGroups: z.array(z.enum(["children", "teens", "adults", "seniors"])).max(4),
  cultural: z.string().max(300),
  accessibility: z.string().max(300),
  venueConstraints: z.string().max(300),
});
export type OnboardingAnswers = z.infer<typeof OnboardingAnswersSchema>;

export const EventPartSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(60),
  guestCount: GuestCountSchema,
});
export type EventPart = z.infer<typeof EventPartSchema>;

export const BudgetLineSchema = z
  .object({
    id: IdSchema,
    category: CategorySchema,
    name: z.string().min(1).max(80),
    partId: IdSchema.nullable(),
    pricing: z.enum(["flat", "per_guest"]),
    /** Per-guest lines follow the event's guest count, or carry their own (EM-43). Null when flat. */
    guestSource: z.enum(["event", "own"]).nullable(),
    ownGuests: GuestCountSchema.nullable(),
    unitCost: MinorSchema.nullable(),
    /** Flat: entered. Per guest: unitCost × guests, kept in sync by code (INV-9). */
    amount: MinorSchema.refine((v) => v >= 0, "Amount can't be negative"),
    label: LabelSchema,
    quoteId: IdSchema.nullable(),
    estimate: z.object({ low: MinorSchema, high: MinorSchema }).nullable(),
    assumptions: z.array(z.string().max(160)).max(3),
    vendorNeeds: z.array(z.string().max(120)).max(5),
    vendorQuestions: z.array(z.string().max(160)).max(10),
    /** EM-64. */
    payment: z
      .object({ paid: MinorSchema, balanceDue: IsoDateSchema.nullable(), note: z.string().max(300) })
      .nullable(),
  })
  .superRefine((line, ctx) => {
    const issue = (message: string): void => ctx.addIssue({ code: "custom", message });
    if (line.pricing === "flat") {
      if (line.guestSource !== null) issue("A flat line has no guest source");
      if (line.unitCost !== null) issue("A flat line has no unit cost");
    } else {
      if (line.guestSource === null) issue("A per-guest line needs a guest source");
      if (line.unitCost === null || line.unitCost < 0) issue("A per-guest line needs a unit cost");
    }
    if ((line.guestSource === "own") !== (line.ownGuests !== null)) {
      issue("Own guest count is set exactly when the guest source is 'own'");
    }
    if (line.estimate && line.estimate.high < line.estimate.low) issue("Estimate high is below low");
    if (line.label === "vendor_quoted" && line.quoteId === null) issue("A vendor-quoted line links a quote");
  });
export type BudgetLine = z.infer<typeof BudgetLineSchema>;

export const TaskSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(100),
  lineId: IdSchema.nullable(),
  priority: z.enum(["high", "medium", "low"]),
  leadTimeDays: z.number().int().min(0).max(540),
  durationDays: z.number().int().min(1).max(90),
  dependsOn: z.array(IdSchema).max(5),
  status: z.enum(["not_started", "in_progress", "done"]),
});
export type Task = z.infer<typeof TaskSchema>;

const EventPlanBaseSchema = z.object({
  schemaVersion: z.literal(1),
  id: IdSchema,
  /** +1 on every change to the plan; proposals record the version they were built on (EM-56). */
  version: z.number().int().nonnegative(),
  isDemo: z.boolean(),
  demoPinned: z.boolean(),
  useCase: UseCaseSchema,
  eventType: EventTypeSchema,
  occasion: z.string().min(1).max(120),
  location: z.object({ city: z.string().min(1).max(80), country: z.string().regex(/^[A-Z]{2}$/) }),
  eventDate: IsoDateSchema,
  currency: CurrencySchema,
  budget: MinorSchema.refine((v) => v > 0, "Budget must be above zero"),
  guestCount: GuestCountSchema,
  parts: z.array(EventPartSchema).max(4),
  answers: OnboardingAnswersSchema,
  description: z.string().max(2000),
  lines: z.array(BudgetLineSchema).max(60),
  tasks: z.array(TaskSchema).max(80),
  assumptions: z.array(z.string().max(200)).max(10),
  openQuestions: z.array(z.string().max(200)).max(5),
  /** EM-66. */
  teamNotes: z.string().max(2000),
  /** EM-65: ids of calculated alerts the user dismissed. */
  dismissedAlerts: z.array(z.string().max(80)).max(50),
});

/** Cross-field rules: references resolve, no dependency loops (EM-45), per-guest sync (INV-9). */
export function planIssues(plan: z.infer<typeof EventPlanBaseSchema>): string[] {
  const issues: string[] = [];
  const lineIds = new Set<string>();
  for (const line of plan.lines) {
    if (lineIds.has(line.id)) issues.push(`Duplicate line id ${line.id}`);
    lineIds.add(line.id);
  }
  const partIds = new Set(plan.parts.map((part) => part.id));
  for (const line of plan.lines) {
    if (line.partId !== null && !partIds.has(line.partId)) issues.push(`Line ${line.id} names a missing part`);
    if (line.pricing === "per_guest" && line.label !== "confirmed" && line.unitCost !== null) {
      const guests = line.guestSource === "own" ? (line.ownGuests ?? 0) : plan.guestCount;
      if (line.amount !== line.unitCost * guests) issues.push(`Line ${line.id} amount is not unit cost × guests`);
    }
  }

  const taskIds = new Set<string>();
  for (const task of plan.tasks) {
    if (taskIds.has(task.id)) issues.push(`Duplicate task id ${task.id}`);
    taskIds.add(task.id);
  }
  for (const task of plan.tasks) {
    if (task.lineId !== null && !lineIds.has(task.lineId)) issues.push(`Task ${task.id} names a missing line`);
    for (const dependency of task.dependsOn) {
      if (dependency === task.id) issues.push(`Task ${task.id} depends on itself`);
      else if (!taskIds.has(dependency)) issues.push(`Task ${task.id} depends on a missing task`);
    }
  }
  const cycle = findCycle(plan.tasks);
  if (cycle) issues.push(`Dependency loop: ${cycle.join(" → ")}`);
  return issues;
}

export const EventPlanSchema = EventPlanBaseSchema.superRefine((plan, ctx) => {
  for (const message of planIssues(plan)) ctx.addIssue({ code: "custom", message });
});
export type EventPlan = z.infer<typeof EventPlanSchema>;
