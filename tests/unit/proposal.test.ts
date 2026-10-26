import { describe, expect, it } from "vitest";
import { addDays } from "@/domain/dates";
import { diffPlans } from "@/domain/diff";
import { DomainError } from "@/domain/errors";
import { applyOps, applyProposal, deterministicOpsFor, isStale, type Proposal } from "@/domain/proposal";
import { EventPlanSchema } from "@/domain/schemas";
import { finalTestPlan, makeLine, makePlan, makeTask } from "../support/factories";

const TODAY = "2026-10-25";

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: "p1",
    eventId: "event-1",
    kind: "revision",
    name: null,
    baseVersion: 0,
    changes: [],
    requestText: null,
    deterministicOps: [],
    options: [],
    interpretation: null,
    assumptions: [],
    selectedOption: null,
    ...overrides,
  };
}

function expectDomainError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`Expected DomainError ${code}`);
}

describe("the final-test fixture", () => {
  it("is a valid plan whose lines add up to the budget", () => {
    const plan = finalTestPlan(TODAY);
    expect(EventPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.lines.reduce((sum, l) => sum + l.amount, 0)).toBe(plan.budget);
  });
});

describe("applyOps", () => {
  const plan = finalTestPlan(TODAY);

  it("refuses any op on a confirmed line (EM-42, R4)", () => {
    expectDomainError(() => applyOps(plan, [{ op: "set_amount", lineId: "venue", value: 1 }]), "locked_line");
    expectDomainError(() => applyOps(plan, [{ op: "remove_line", lineId: "venue" }]), "locked_line");
  });

  it("checks that an op fits its target", () => {
    expectDomainError(() => applyOps(plan, [{ op: "set_amount", lineId: "catering", value: 1 }]), "wrong_target");
    expectDomainError(() => applyOps(plan, [{ op: "set_unit_cost", lineId: "decor", value: 1 }]), "wrong_target");
    expectDomainError(() => applyOps(plan, [{ op: "set_guests", lineId: "catering", value: 40 }]), "wrong_target");
    expectDomainError(() => applyOps(plan, [{ op: "set_amount", lineId: "ghost", value: 1 }]), "not_found");
  });

  it("recalculates per-guest lines when the guest count changes (EM-17)", () => {
    const next = applyOps(plan, deterministicOpsFor({ guestCount: 180 }));
    expect(next.lines.find((l) => l.id === "catering")?.amount).toBe(200_000 * 180);
    expect(next.lines.find((l) => l.id === "venue")?.amount).toBe(25_000_000);
  });

  it("refuses a dependency loop and names it (EM-45)", () => {
    const loop = makeTask({ id: "loop", title: "Send invitations", dependsOn: ["tasting"] });
    const withLoop = { ...plan, tasks: [...plan.tasks.map((t) => (t.id === "venue-task" ? { ...t, dependsOn: ["loop"] } : t)), loop] };
    expect(() => applyOps(withLoop, [])).toThrow(/Book venue|Send invitations/);
  });

  it("removes a task and the dependencies that pointed at it, but never a finished task", () => {
    const next = applyOps(plan, [{ op: "remove_task", taskId: "caterer" }]);
    expect(next.tasks.find((t) => t.id === "tasting")?.dependsOn).toEqual([]);
    const done = { ...plan, tasks: plan.tasks.map((t) => (t.id === "caterer" ? { ...t, status: "done" as const } : t)) };
    expectDomainError(() => applyOps(done, [{ op: "remove_task", taskId: "caterer" }]), "task_done");
  });

  it("only adds new lines as estimates, with fresh ids", () => {
    const fresh = makeLine({ id: "dj", category: "entertainment", name: "DJ", amount: 2_000_000 });
    expect(applyOps(plan, [{ op: "add_line", line: fresh }]).lines).toHaveLength(6);
    expectDomainError(() => applyOps(plan, [{ op: "add_line", line: { ...fresh, label: "confirmed" } }]), "invalid_value");
    expectDomainError(() => applyOps(plan, [{ op: "add_line", line: { ...fresh, id: "decor" } }]), "invalid_value");
  });

  it("detaches tasks from a removed line", () => {
    const next = applyOps(plan, [{ op: "remove_line", lineId: "catering" }]);
    expect(next.tasks.filter((t) => t.lineId === "catering")).toEqual([]);
  });
});

describe("applyProposal (EM-53, EM-56)", () => {
  const plan = finalTestPlan(TODAY);

  it("refuses a stale proposal", () => {
    const stale = proposal({ baseVersion: 3 });
    expect(isStale(stale, plan)).toBe(true);
    expectDomainError(() => applyProposal(plan, stale), "stale_proposal");
  });

  it("applies code-built changes plus the selected option, and bumps the version", () => {
    const next = applyProposal(
      plan,
      proposal({
        deterministicOps: deterministicOpsFor({ budget: 60_000_000 }),
        options: [{ key: "O1", title: "Trim decor", rationale: "", assumptions: [], ops: [{ op: "set_amount", lineId: "decor", value: 4_000_000 }] }],
        selectedOption: "O1",
      }),
    );
    expect(next.version).toBe(1);
    expect(next.budget).toBe(60_000_000);
    expect(next.lines.find((l) => l.id === "decor")?.amount).toBe(4_000_000);
  });

  it("ignores options that aren't selected (EM-54: nothing is chosen for the user)", () => {
    const next = applyProposal(
      plan,
      proposal({
        options: [{ key: "O1", title: "Trim decor", rationale: "", assumptions: [], ops: [{ op: "set_amount", lineId: "decor", value: 1 }] }],
      }),
    );
    expect(next.lines.find((l) => l.id === "decor")?.amount).toBe(12_000_000);
  });

  it("leaves the original plan untouched when Apply fails (INV-10)", () => {
    const snapshot = JSON.stringify(plan);
    const bad = proposal({
      options: [{ key: "O1", title: "Cut venue", rationale: "", assumptions: [], ops: [{ op: "set_amount", lineId: "venue", value: 1 }] }],
      selectedOption: "O1",
    });
    expect(() => applyProposal(plan, bad)).toThrow(DomainError);
    expect(JSON.stringify(plan)).toBe(snapshot);
  });
});

describe("before/after diff (EM-52, spec §12)", () => {
  const today = TODAY;
  const before = finalTestPlan(today);
  const after = applyProposal(
    before,
    proposal({ deterministicOps: deterministicOpsFor({ budget: 60_000_000, eventDate: addDays(before.eventDate, -14) }) }),
  );
  const diff = diffPlans(before, after, today);

  it("shows the budget change and the shortfall, still adding up exactly", () => {
    expect(diff.event.budget).toEqual({ before: 80_000_000, after: 60_000_000, changed: true });
    expect(diff.budget.after.shortfall).toBe(20_000_000);
    expect(diff.budget.after.allocated + diff.budget.after.remaining).toBe(60_000_000);
  });

  it("moves every deadline 14 days earlier", () => {
    expect(diff.tasks).toHaveLength(3);
    for (const task of diff.tasks) {
      expect(task.deadline.after).toBe(addDays(task.deadline.before ?? "", -14));
    }
  });

  it("keeps the confirmed venue unchanged and asks to reconfirm it for the new date (EM-42, A12)", () => {
    const venue = diff.lines.find((l) => l.id === "venue");
    expect(venue?.change).toBe("unchanged");
    expect(venue?.flags).toEqual(["locked", "reconfirm_new_date"]);
  });

  it("marks tasks whose status got worse as compressed", () => {
    // Venue: deadline event − 90 before (latest start −97); after moving 14 days, −104 (latest start −111).
    // On day −108 it was on track and is now tight.
    const tightToday = addDays(before.eventDate, -108);
    const tight = diffPlans(before, after, tightToday);
    expect(tight.tasks.find((t) => t.id === "venue-task")).toMatchObject({ compressed: true, status: { before: "on_track", after: "tight" } });
  });

  it("flags lines with their own guest count and confirmed per-guest lines on a guest change (A1, A14)", () => {
    const plan = makePlan({
      lines: [
        makeLine({ id: "rehearsal", pricing: "per_guest", guestSource: "own", ownGuests: 40, unitCost: 100, amount: 4_000 }),
        makeLine({ id: "reception", pricing: "per_guest", guestSource: "event", unitCost: 100, amount: 15_000, label: "confirmed" }),
      ],
    });
    const changed = applyOps(plan, deterministicOpsFor({ guestCount: 180 }));
    const guestDiff = diffPlans(plan, changed, today);
    expect(guestDiff.lines.find((l) => l.id === "rehearsal")?.flags).toEqual(["own_guest_count_unchanged"]);
    expect(guestDiff.lines.find((l) => l.id === "reception")).toMatchObject({
      flags: ["locked", "confirmed_for_other_guest_count"],
      confirmedFor: 150,
    });
  });

  it("lists added and removed lines and tasks", () => {
    const changed = applyOps(before, [
      { op: "remove_line", lineId: "music" },
      { op: "add_line", line: makeLine({ id: "dj", name: "DJ", amount: 1 }) },
      { op: "remove_task", taskId: "tasting" },
      { op: "add_task", task: makeTask({ id: "playlist", title: "Playlist sign-off" }) },
    ]);
    const d = diffPlans(before, changed, today);
    expect(d.lines.map((l) => [l.id, l.change])).toEqual(expect.arrayContaining([["music", "removed"], ["dj", "added"]]));
    expect(d.tasks.map((t) => [t.id, t.change])).toEqual(expect.arrayContaining([["tasting", "removed"], ["playlist", "added"]]));
  });
});
