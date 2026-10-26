import { describe, expect, it } from "vitest";
import { summarizeBudget } from "@/domain/budget";
import { DomainError } from "@/domain/errors";
import { confirmedGuests, lineGuests, syncPerGuestAmounts, unitCostFromAllocation } from "@/domain/guests";
import { transitionLabel } from "@/domain/labels";
import { makeLine, makePlan } from "../support/factories";

describe("cost labels (EM-41)", () => {
  const estimate = makeLine({ id: "l", amount: 1_000 });

  it("goes estimate → quoted → confirmed → back to quoted", () => {
    const quoted = transitionLabel(estimate, { type: "link_quote", quoteId: "q1", total: 1_500 }, 100);
    expect(quoted).toMatchObject({ label: "vendor_quoted", quoteId: "q1", amount: 1_500 });
    const confirmed = transitionLabel(quoted, { type: "confirm" }, 100);
    expect(confirmed.label).toBe("confirmed");
    expect(transitionLabel(confirmed, { type: "unconfirm" }, 100).label).toBe("vendor_quoted");
  });

  it("un-confirms a line with no quote back to an estimate", () => {
    const confirmed = transitionLabel(estimate, { type: "confirm" }, 100);
    expect(transitionLabel(confirmed, { type: "unconfirm" }, 100).label).toBe("ai_estimate");
  });

  it("refuses transitions that make no sense", () => {
    const confirmed = transitionLabel(estimate, { type: "confirm" }, 100);
    expect(() => transitionLabel(confirmed, { type: "confirm" }, 100)).toThrow(DomainError);
    expect(() => transitionLabel(confirmed, { type: "link_quote", quoteId: "q", total: 1 }, 100)).toThrow(DomainError);
    expect(() => transitionLabel(estimate, { type: "unconfirm" }, 100)).toThrow(DomainError);
    expect(() => transitionLabel(estimate, { type: "vendor_cancelled" }, 100)).toThrow(DomainError);
  });

  it("reverts a quoted line to an estimate when its quote is deleted, keeping the amount (A24)", () => {
    const quoted = transitionLabel(estimate, { type: "link_quote", quoteId: "q1", total: 1_500 }, 100);
    expect(transitionLabel(quoted, { type: "quote_deleted", quoteId: "q1" }, 100)).toMatchObject({
      label: "ai_estimate",
      quoteId: null,
      amount: 1_500,
    });
    expect(transitionLabel(quoted, { type: "quote_deleted", quoteId: "other" }, 100)).toBe(quoted);
  });

  it("keeps a confirmed line confirmed when its quote document is deleted", () => {
    const quoted = transitionLabel(estimate, { type: "link_quote", quoteId: "q1", total: 1_500 }, 100);
    const confirmed = transitionLabel(quoted, { type: "confirm" }, 100);
    expect(transitionLabel(confirmed, { type: "quote_deleted", quoteId: "q1" }, 100)).toMatchObject({
      label: "confirmed",
      quoteId: null,
    });
  });

  it("returns a cancelled vendor's line to an estimate and says why (EM-47)", () => {
    const quoted = transitionLabel(estimate, { type: "link_quote", quoteId: "q1", total: 1_500 }, 100);
    const cancelled = transitionLabel(transitionLabel(quoted, { type: "confirm" }, 100), { type: "vendor_cancelled" }, 100);
    expect(cancelled).toMatchObject({ label: "ai_estimate", quoteId: null, amount: 1_500 });
    expect(cancelled.assumptions[0]).toBe("Previous vendor's price");
  });

  it("prices a per-guest line from a quote total, keeping unit cost × guests exact", () => {
    const perGuest = makeLine({ id: "c", pricing: "per_guest", guestSource: "event", unitCost: 100, amount: 15_000 });
    const quoted = transitionLabel(perGuest, { type: "link_quote", quoteId: "q", total: 18_500_000 }, 150);
    expect(quoted.unitCost).toBe(123_333);
    expect(quoted.amount).toBe(123_333 * 150);
  });
});

describe("guest pricing (EM-17, EM-43)", () => {
  const plan = makePlan({
    guestCount: 150,
    lines: [
      makeLine({ id: "event", pricing: "per_guest", guestSource: "event", unitCost: 100, amount: 15_000 }),
      makeLine({ id: "own", pricing: "per_guest", guestSource: "own", ownGuests: 40, unitCost: 100, amount: 4_000 }),
      makeLine({ id: "flat", amount: 9_999 }),
      makeLine({ id: "locked", pricing: "per_guest", guestSource: "event", unitCost: 100, amount: 15_000, label: "confirmed" }),
    ],
  });

  it("knows how many guests each line is priced for", () => {
    expect(plan.lines.map((l) => lineGuests(l, 180))).toEqual([180, 40, null, 180]);
  });

  it("recalculates only per-guest lines that follow the event count, and never confirmed ones", () => {
    const synced = syncPerGuestAmounts({ ...plan, guestCount: 180 });
    expect(synced.lines.map((l) => l.amount)).toEqual([18_000, 4_000, 9_999, 15_000]);
    expect(syncPerGuestAmounts(plan)).toBe(plan);
  });

  it("works out the guest count a confirmed line was frozen for (A14)", () => {
    expect(confirmedGuests(plan.lines[3]!)).toBe(150);
    expect(confirmedGuests(plan.lines[0]!)).toBeNull();
  });

  it("rounds unit costs down so they never exceed the allocation", () => {
    expect(unitCostFromAllocation(1_000, 3)).toBe(333);
    expect(() => unitCostFromAllocation(1_000, 0)).toThrow();
  });
});

describe("budget summary (EM-16, EM-42, EM-44)", () => {
  it("adds up exactly and reports a shortfall and a confirmed overrun", () => {
    const plan = makePlan({
      budget: 1_000,
      lines: [makeLine({ id: "a", amount: 700, label: "confirmed" }), makeLine({ id: "b", amount: 500 })],
    });
    const summary = summarizeBudget(plan);
    expect(summary).toMatchObject({ allocated: 1_200, remaining: -200, shortfall: 200, confirmed: 700, confirmedOverrun: 0 });
    expect(summary.allocated + summary.remaining).toBe(summary.budget);
    expect(summarizeBudget({ ...plan, budget: 600 }).confirmedOverrun).toBe(100);
  });

  it("gives percentages that add up to 100.0 with what's left", () => {
    const plan = makePlan({ budget: 3_000, lines: [makeLine({ id: "a", amount: 1_000 }), makeLine({ id: "b", amount: 1_000 })] });
    const shares = [...summarizeBudget(plan).percentTenths.values()];
    expect(shares).toEqual([334, 333]); // remaining holds the last 33.3%: 33.4 + 33.3 + 33.3 = 100.0
  });
});
