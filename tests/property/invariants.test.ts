import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allocateLargestRemainder } from "@/domain/allocation";
import { parseAmount } from "@/domain/amount-parser";
import { summarizeBudget } from "@/domain/budget";
import { addDays, compareDates } from "@/domain/dates";
import { diffPlans } from "@/domain/diff";
import { deepEqual } from "@/domain/equal";
import { DomainError } from "@/domain/errors";
import { formatMoney } from "@/domain/format";
import { findCycle, topologicalOrder } from "@/domain/graph";
import { lineGuests } from "@/domain/guests";
import { applyOps, applyProposal, type Proposal } from "@/domain/proposal";
import { computeSchedule } from "@/domain/schedule";
import { EventPlanSchema, type EventPlan } from "@/domain/schemas";
import { arbOps, arbPlan, TODAY } from "./arbitraries";

// About a quarter of generated op sequences are legal and non-empty; 300 runs keep ~75 real applies per property.
fc.configureGlobal({ numRuns: 300 });

/** Applies ops, returning the new plan, or null when the domain refused them (always a DomainError). */
function tryApply(plan: EventPlan, ops: Parameters<typeof applyOps>[1]): EventPlan | null {
  try {
    return applyOps(plan, ops);
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return null;
  }
}

const planWithOps = arbPlan.chain((plan) => arbOps(plan).map((ops) => ({ plan, ops })));

function proposalOf(plan: EventPlan, ops: Proposal["deterministicOps"]): Proposal {
  return {
    id: "p",
    eventId: plan.id,
    kind: "revision",
    name: null,
    baseVersion: plan.version,
    changes: [],
    requestText: null,
    deterministicOps: ops,
    options: [],
    interpretation: null,
    assumptions: [],
    selectedOption: null,
  };
}

describe("domain invariants", () => {
  it("generated plans are valid (sanity check for the generators)", () => {
    fc.assert(fc.property(arbPlan, (plan) => EventPlanSchema.safeParse(plan).success));
  });

  it("INV-1: line amounts + remaining = budget, exactly, after any accepted ops (EM-44)", () => {
    fc.assert(
      fc.property(planWithOps, ({ plan, ops }) => {
        const next = tryApply(plan, ops) ?? plan;
        const summary = summarizeBudget(next);
        expect(summary.allocated + summary.remaining).toBe(next.budget);
        expect(Number.isSafeInteger(summary.remaining)).toBe(true);
      }),
    );
  });

  it("INV-2: confirmed lines never change, whatever ops are applied (EM-42)", () => {
    fc.assert(
      fc.property(planWithOps, ({ plan, ops }) => {
        const next = tryApply(plan, ops);
        if (!next) return;
        const after = new Map(next.lines.map((line) => [line.id, line]));
        for (const line of plan.lines.filter((l) => l.label === "confirmed")) {
          expect(deepEqual(after.get(line.id), line)).toBe(true);
        }
      }),
    );
  });

  it("INV-3: accepted ops never leave a dependency loop (EM-45)", () => {
    fc.assert(
      fc.property(planWithOps, ({ plan, ops }) => {
        const next = tryApply(plan, ops);
        if (next) expect(findCycle(next.tasks)).toBeNull();
      }),
    );
  });

  it("INV-3: findCycle and topological ordering agree on any graph", () => {
    const arbGraph = fc
      .integer({ min: 1, max: 8 })
      .chain((n) =>
        fc.tuple(...Array.from({ length: n }, (_, i) => fc.uniqueArray(fc.integer({ min: 0, max: n - 1 }), { maxLength: 3 }).map((deps) => ({ id: `n${i}`, dependsOn: deps.map((d) => `n${d}`) })))),
      );
    fc.assert(
      fc.property(arbGraph, (nodes) => {
        const cycle = findCycle(nodes);
        if (cycle) expect(() => topologicalOrder(nodes)).toThrow();
        else expect(topologicalOrder(nodes)).toHaveLength(nodes.length);
      }),
    );
  });

  it("INV-4: building, diffing and discarding a proposal never touches the plan (EM-53)", () => {
    fc.assert(
      fc.property(planWithOps, ({ plan, ops }) => {
        const snapshot = structuredClone(plan);
        const proposed = tryApply(plan, ops);
        if (proposed) diffPlans(plan, proposed, TODAY);
        // Discard = delete the stored proposal; the plan itself was never written.
        expect(plan).toEqual(snapshot);
      }),
    );
  });

  it("INV-5: allocations are non-negative, add up exactly, and sit within one unit of each share (EM-14)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 ** 13 }),
        fc.array(fc.double({ min: 0, max: 100, noNaN: true }), { minLength: 1, maxLength: 25 }).filter((w) => w.some((x) => x > 1e-6)),
        (total, weights) => {
          const parts = allocateLargestRemainder(total, weights);
          expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
          const scaled = weights.map((w) => Math.round(w * 1_000_000));
          const sum = scaled.reduce((a, b) => a + b, 0);
          parts.forEach((part, i) => {
            expect(part).toBeGreaterThanOrEqual(0);
            expect(Math.abs(part - (total * (scaled[i] ?? 0)) / sum)).toBeLessThan(1 + 1e-6);
          });
        },
      ),
    );
  });

  it("INV-6: every deadline respects its lead time and leaves room for its dependents (EM-46)", () => {
    fc.assert(
      fc.property(arbPlan, (plan) => {
        const schedule = computeSchedule(plan, TODAY);
        for (const task of plan.tasks) {
          const deadline = schedule.get(task.id)?.deadline ?? "";
          expect(compareDates(deadline, addDays(plan.eventDate, -task.leadTimeDays))).toBeLessThanOrEqual(0);
          for (const dependency of task.dependsOn) {
            const dependencyDeadline = schedule.get(dependency)?.deadline ?? "";
            expect(compareDates(dependencyDeadline, addDays(deadline, -task.durationDays))).toBeLessThanOrEqual(0);
          }
        }
      }),
    );
  });

  it("INV-7: a plan survives a serialise-and-validate round trip unchanged", () => {
    fc.assert(
      fc.property(arbPlan, (plan) => {
        const restored = EventPlanSchema.parse(JSON.parse(JSON.stringify(plan)));
        expect(deepEqual(restored, plan)).toBe(true);
      }),
    );
  });

  it("INV-8: parse(format(x)) = x across locales and currencies (EM-37, EM-38)", () => {
    const cases = fc.tuple(
      fc.constantFrom("en-IN", "en-US", "de-DE", "ja-JP"),
      fc.constantFrom("INR", "USD", "EUR", "JPY"),
      fc.integer({ min: 0, max: 10 ** 12 }),
    );
    fc.assert(
      fc.property(cases, ([locale, currency, minor]) => {
        expect(parseAmount(formatMoney(minor, currency, locale), currency, locale)).toEqual({ kind: "ok", minor });
      }),
      { numRuns: 300 },
    );
  });

  it("INV-9: every unconfirmed per-guest line costs exactly unit cost × guests (EM-43)", () => {
    fc.assert(
      fc.property(planWithOps, ({ plan, ops }) => {
        const next = tryApply(plan, ops) ?? plan;
        for (const line of next.lines) {
          if (line.pricing !== "per_guest" || line.label === "confirmed") continue;
          expect(line.amount).toBe((line.unitCost ?? 0) * (lineGuests(line, next.guestCount) ?? 0));
        }
      }),
    );
  });

  it("INV-10: Apply is all or nothing (EM-53)", () => {
    fc.assert(
      fc.property(planWithOps, ({ plan, ops }) => {
        const snapshot = structuredClone(plan);
        const proposal = proposalOf(plan, ops);
        try {
          const next = applyProposal(plan, proposal);
          expect(next.version).toBe(plan.version + 1);
          expect(EventPlanSchema.safeParse(next).success).toBe(true);
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
        }
        expect(plan).toEqual(snapshot);
      }),
    );
  });
});
