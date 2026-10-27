import { describe, expect, it } from "vitest";
import { summarizeBudget } from "@/domain/budget";
import {
  addLine,
  addTask,
  confirmLine,
  removeLine,
  removeTask,
  setTaskStatus,
  unconfirmLine,
  unpickableDependencies,
  updateLine,
  updateTask,
  type LineInput,
  type TaskInput,
} from "@/domain/edits";
import { DomainError } from "@/domain/errors";
import { nextUp, progressPercent } from "@/domain/schedule";
import { finalTestPlan } from "../support/factories";

/** Dashboard edits (EM-13, EM-16, EM-20, EM-22–EM-24, EM-45). Plan: ₹8,00,000, 150 guests. */
const TODAY = "2026-10-26";
const plan = finalTestPlan(TODAY);

const flat = (overrides: Partial<LineInput> = {}): LineInput => ({
  name: "Mehendi artist",
  category: "other",
  pricing: "flat",
  amount: 1_500_000,
  unitCost: 0,
  guestSource: "event",
  ownGuests: null,
  ...overrides,
});

const taskInput = (overrides: Partial<TaskInput> = {}): TaskInput => ({
  title: "Order favours",
  priority: "low",
  leadTimeDays: 20,
  durationDays: 3,
  dependsOn: [],
  lineId: null,
  ...overrides,
});

function inputOf(lineId: string): LineInput {
  const l = plan.lines.find((x) => x.id === lineId);
  if (!l) throw new Error("no line");
  return {
    name: l.name,
    category: l.category,
    pricing: l.pricing,
    amount: l.amount,
    unitCost: l.unitCost ?? 0,
    guestSource: l.guestSource ?? "event",
    ownGuests: l.ownGuests,
  };
}

function expectDomainError(fn: () => unknown, code: string, message?: RegExp): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    if (message) expect((error as DomainError).message).toMatch(message);
    return;
  }
  throw new Error("expected a DomainError");
}

describe("line edits (EM-13, EM-16)", () => {
  it("adds a line as an estimate, and the totals follow at once (EM-16, INV-1)", () => {
    const next = addLine(plan, "new-line", flat());
    expect(next.lines.at(-1)).toMatchObject({ id: "new-line", name: "Mehendi artist", amount: 1_500_000, label: "ai_estimate" });
    const before = summarizeBudget(plan);
    const after = summarizeBudget(next);
    expect(after.remaining).toBe(before.remaining - 1_500_000);
    expect(after.allocated + after.remaining).toBe(plan.budget);
  });

  it("adds a per-guest line with its own guest count, priced unit cost × guests (EM-43, INV-9)", () => {
    const next = addLine(plan, "dinner", flat({ name: "Rehearsal dinner", pricing: "per_guest", unitCost: 150_000, guestSource: "own", ownGuests: 40 }));
    expect(next.lines.at(-1)).toMatchObject({ pricing: "per_guest", guestSource: "own", ownGuests: 40, unitCost: 150_000, amount: 6_000_000 });
  });

  it("renames, recategorises and reprices a line", () => {
    const next = updateLine(plan, "decor", { ...inputOf("decor"), name: "Flowers", category: "other", amount: 9_000_000 });
    expect(next.lines.find((l) => l.id === "decor")).toMatchObject({ name: "Flowers", category: "other", amount: 9_000_000 });
  });

  it("switches a line between flat and per guest", () => {
    const perGuest = updateLine(plan, "photo", { ...inputOf("photo"), pricing: "per_guest", unitCost: 50_000, guestSource: "event" });
    expect(perGuest.lines.find((l) => l.id === "photo")).toMatchObject({ pricing: "per_guest", amount: 50_000 * 150 });
    const back = updateLine(perGuest, "photo", { ...inputOf("photo"), pricing: "flat", amount: 7_000_000 });
    expect(back.lines.find((l) => l.id === "photo")).toMatchObject({ pricing: "flat", unitCost: null, guestSource: null, amount: 7_000_000 });
  });

  it("refuses a blank name or a missing own guest count", () => {
    expectDomainError(() => addLine(plan, "x", flat({ name: "  " })), "invalid_value", /name/);
    expectDomainError(() => addLine(plan, "x", flat({ pricing: "per_guest", guestSource: "own", ownGuests: null })), "invalid_value", /guests/);
  });

  it("lets a confirmed line be renamed but not repriced or deleted until it is un-confirmed (EM-20, EM-42)", () => {
    expect(updateLine(plan, "venue", { ...inputOf("venue"), name: "Palace lawn" }).lines.find((l) => l.id === "venue")?.name).toBe("Palace lawn");
    expectDomainError(() => updateLine(plan, "venue", { ...inputOf("venue"), amount: 1 }), "locked_line", /Un-confirm/);
    expectDomainError(() => removeLine(plan, "venue"), "locked_line", /Un-confirm/);
  });

  it("removes a line and unlinks its tasks", () => {
    const next = removeLine(plan, "catering");
    expect(next.lines.some((l) => l.id === "catering")).toBe(false);
    expect(next.tasks.filter((t) => t.lineId === "catering")).toEqual([]);
    expect(next.tasks).toHaveLength(plan.tasks.length);
  });

  it("refuses edits to a line that no longer exists", () => {
    expectDomainError(() => updateLine(plan, "gone", flat()), "not_found");
  });
});

describe("confirming (EM-20, EM-41)", () => {
  it("confirms and un-confirms only through these user actions", () => {
    const confirmed = confirmLine(plan, "photo");
    expect(confirmed.lines.find((l) => l.id === "photo")?.label).toBe("confirmed");
    expect(unconfirmLine(confirmed, "photo").lines.find((l) => l.id === "photo")?.label).toBe("ai_estimate");
  });

  it("needs an amount, and can't confirm twice", () => {
    const zero = updateLine(plan, "photo", { ...inputOf("photo"), amount: 0 });
    expectDomainError(() => confirmLine(zero, "photo"), "invalid_value", /amount/);
    expectDomainError(() => confirmLine(plan, "venue"), "illegal_transition");
    expectDomainError(() => unconfirmLine(plan, "photo"), "illegal_transition");
  });
});

describe("task edits (EM-22, EM-23, EM-24, EM-45)", () => {
  it("adds, edits and removes tasks; removing one drops it from others' dependencies", () => {
    const added = addTask(plan, "favours", taskInput({ dependsOn: ["venue-task"] }));
    expect(added.tasks.at(-1)).toMatchObject({ id: "favours", status: "not_started", dependsOn: ["venue-task"] });
    const edited = updateTask(added, "favours", taskInput({ title: "Order return gifts", priority: "high" }));
    expect(edited.tasks.find((t) => t.id === "favours")).toMatchObject({ title: "Order return gifts", priority: "high", dependsOn: [] });
    const removed = removeTask(plan, "venue-task");
    expect(removed.tasks.find((t) => t.id === "caterer")?.dependsOn).toEqual([]);
  });

  it("refuses a dependency loop and names it (EM-45)", () => {
    const venue = plan.tasks.find((t) => t.id === "venue-task");
    if (!venue) throw new Error("no task");
    expectDomainError(
      () => updateTask(plan, "venue-task", { ...taskInput(), title: venue.title, dependsOn: ["tasting"] }),
      "dependency_cycle",
      /Book venue → Menu tasting → Book caterer → Book venue|Menu tasting → Book caterer → Book venue → Menu tasting|Book caterer → Book venue → Menu tasting → Book caterer/,
    );
  });

  it("greys out tasks that already wait for this one (EM-45, layer 3)", () => {
    expect(unpickableDependencies(plan, "venue-task")).toEqual(new Set(["venue-task", "caterer", "tasting"]));
    expect(unpickableDependencies(plan, "tasting")).toEqual(new Set(["tasting"]));
    expect(unpickableDependencies(plan, null)).toEqual(new Set());
  });

  it("marking a task done makes the next one available and updates progress and Next up (EM-24, EM-26)", () => {
    expect(nextUp(plan, TODAY).map((t) => t.id)).toEqual(["venue-task"]);
    const done = setTaskStatus(plan, "venue-task", "done");
    expect(nextUp(done, TODAY).map((t) => t.id)).toEqual(["caterer"]);
    expect(progressPercent(done.tasks)).toBe(33);
    expect(setTaskStatus(done, "venue-task", "not_started").tasks[0]?.status).toBe("not_started");
  });

  it("refuses a blank title or an unknown task", () => {
    expectDomainError(() => addTask(plan, "t", taskInput({ title: " " })), "invalid_value", /title/);
    expectDomainError(() => setTaskStatus(plan, "nope", "done"), "not_found");
  });
});
