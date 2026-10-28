import { describe, expect, it } from "vitest";
import { bestFit, fitScore } from "@/domain/fit-score";
import type { Quote, QuoteDetails } from "@/domain/quote";
import { viewQuote, type QuoteView } from "@/domain/quote-checks";
import { makeLine, makePlan } from "../support/factories";

/** EM-68: the fit score, calculated by code. Line: ₹1,00,000. */
const line = makeLine({ id: "catering", category: "catering", name: "Catering", amount: 10_000_000, vendorNeeds: ["Veg menu", "Service staff"] });
const plan = makePlan({ lines: [line] });

function view(d: Partial<QuoteDetails>, quote: Partial<Quote> = {}): QuoteView {
  const details: QuoteDetails = {
    vendorName: "Vendor",
    currency: "INR",
    items: [{ description: "Dinner", kind: "item", quantity: null, unitPrice: null, amount: 10_000_000 }],
    statedTotal: 10_000_000,
    taxTreatment: "included",
    guestsCovered: null,
    inclusions: [],
    exclusions: [],
    needsCoverage: [],
    clarifications: [],
    validUntil: null,
    ...d,
  };
  const result = viewQuote(
    {
      id: "q1",
      lineId: line.id,
      source: "paste",
      rawText: "x".repeat(50),
      extraction: null,
      manual: details,
      convertedTotal: null,
      cancelled: false,
      note: "",
      createdAt: "2026-10-27T10:00:00.000Z",
      ...quote,
    },
    line,
    plan,
  );
  if (!result) throw new Error("expected a view");
  return result;
}

const items = (amount: number) => [{ description: "Dinner", kind: "item" as const, quantity: null, unitPrice: null, amount }];

describe("fitScore (EM-68)", () => {
  it.each([
    ["on budget, clear, no needs listed", {}, { total: 100, budget: 50, needs: 30, clarity: 20 }],
    ["under budget scores the same as on budget", { items: items(8_000_000), statedTotal: 8_000_000 }, { total: 100, budget: 50 }],
    ["10% over loses 5 budget points", { items: items(11_000_000), statedTotal: 11_000_000 }, { budget: 45 }],
    ["100% over or more scores 0 for budget", { items: items(20_000_000), statedTotal: 20_000_000 }, { budget: 0 }],
    [
      "one of two needs covered: 15 of 30",
      {
        needsCoverage: [
          { need: "Veg menu", status: "covered" as const },
          { need: "Service staff", status: "not_mentioned" as const },
        ],
      },
      { needs: 15 },
    ],
    ["a total gap costs 8 clarity points", { statedTotal: 10_500_000 }, { clarity: 12, deductions: ["total_gap"] }],
    ["no stated total costs 8", { statedTotal: null }, { clarity: 12, deductions: ["no_total"] }],
    ["unclear tax costs 6", { taxTreatment: "unclear" as const }, { clarity: 14, deductions: ["tax"] }],
    ["a gap and unclear tax together", { statedTotal: 10_500_000, taxTreatment: "unclear" as const }, { clarity: 6, deductions: ["total_gap", "tax"] }],
  ])("%s", (_name, details, expected) => {
    expect(fitScore(view(details), line.amount)).toMatchObject(expected);
  });

  it("costs 6 clarity points for values not found in the quote text (Q4)", () => {
    const ungrounded: QuoteView = { ...view({}), manual: false, ungroundedItems: new Set([0]) };
    expect(fitScore(ungrounded, line.amount)).toMatchObject({ clarity: 14, deductions: ["unverified"] });
  });

  it("scores budget fit as 0, and says so, when the quote can't be compared yet (EM-50)", () => {
    expect(fitScore(view({ currency: "USD" }), line.amount)).toMatchObject({ budget: 0, notCompared: true, total: 50 });
  });

  it("always adds the parts up to the total, within 0 to 100", () => {
    for (const amount of [1, 5_000_000, 10_000_000, 12_345_678, 99_000_000]) {
      const s = fitScore(view({ items: items(amount), statedTotal: amount + 7_000, taxTreatment: "unclear" }), line.amount);
      expect(s.total).toBe(s.budget + s.needs + s.clarity);
      expect(s.total).toBeGreaterThanOrEqual(0);
      expect(s.total).toBeLessThanOrEqual(100);
    }
  });
});

describe("bestFit (EM-68)", () => {
  const a = view({}, { id: "a" });
  const b = view({ taxTreatment: "unclear" }, { id: "b" });

  it("names the single highest score among compared quotes", () => {
    expect(bestFit([b, a], line.amount)).toBe("a");
  });

  it("names none with fewer than two compared quotes, or a shared top score", () => {
    expect(bestFit([a], line.amount)).toBeNull();
    expect(bestFit([a, view({}, { id: "c" })], line.amount)).toBeNull();
    expect(bestFit([a, view({ currency: "USD" }, { id: "usd" })], line.amount)).toBeNull();
  });
});
