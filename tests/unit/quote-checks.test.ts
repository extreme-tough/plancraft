import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { confirmLine, linkQuote, quoteDeleted } from "@/domain/edits";
import { detailsFromResponse, type Quote, type QuoteDetails } from "@/domain/quote";
import { comparableViews, numbersInText, questionText, viewQuote, type QuoteView } from "@/domain/quote-checks";
import { QuoteResponseSchema } from "@/domain/quote-contract";
import type { EventPlan } from "@/domain/schemas";
import { SAMPLE_QUOTES } from "@/demo/sample-quotes";
import { makeLine, makePlan } from "../support/factories";

/** Quote checks (spec §7.5, EM-32, EM-33, EM-49 to EM-51, Q3 to Q5), all calculated on read. */

const NEED = "Vegetarian options clearly labelled";
const catering = makeLine({
  id: "catering",
  category: "catering",
  name: "Catering",
  pricing: "per_guest",
  guestSource: "event",
  unitCost: 130_000,
  amount: 19_500_000, // ₹1,95,000 for 150 guests
  vendorNeeds: [NEED],
});
const plan = makePlan({ lines: [catering] });

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: "q1",
    lineId: "catering",
    source: "paste",
    rawText: "x".repeat(50),
    extraction: null,
    manual: null,
    convertedTotal: null,
    cancelled: false,
    note: "",
    createdAt: "2026-10-27T10:00:00.000Z",
    ...overrides,
  };
}

function details(overrides: Partial<QuoteDetails> = {}): QuoteDetails {
  return {
    vendorName: "Vendor",
    currency: "INR",
    items: [],
    statedTotal: null,
    taxTreatment: "included",
    guestsCovered: null,
    inclusions: [],
    exclusions: [],
    needsCoverage: [],
    clarifications: [],
    validUntil: null,
    ...overrides,
  };
}

const item = (amount: number, kind: QuoteDetails["items"][number]["kind"] = "item", quantity: number | null = null, unitPrice: number | null = null) => ({
  description: kind,
  kind,
  quantity,
  unitPrice,
  amount,
});

function view(d: QuoteDetails, overrides: Partial<Quote> = {}, p: EventPlan = plan): QuoteView {
  const result = viewQuote(quote({ manual: d, ...overrides }), catering, p);
  if (!result) throw new Error("expected a view");
  return result;
}

function sample(key: string): QuoteView {
  const s = SAMPLE_QUOTES.find((q) => q.key === key);
  if (!s) throw new Error(key);
  const response = QuoteResponseSchema.parse(JSON.parse(readFileSync(`tests/fixtures/ai/quote/${key}.json`, "utf8")));
  const result = viewQuote(quote({ rawText: s.text, extraction: detailsFromResponse(response, "INR") }), catering, plan);
  if (!result) throw new Error("expected a view");
  return result;
}

describe("the three sample quotes (UX-10)", () => {
  it("hidden charge: the items fall ₹10,000 short of the stated total (EM-49)", () => {
    const v = sample("hidden-charge");
    expect(v).toMatchObject({
      base: 16_950_000,
      taxesAndFees: 2_737_500,
      calculatedTotal: 19_687_500,
      total: 20_687_500,
      totalCheck: { kind: "gap", difference: 1_000_000 },
      comparableTotal: 20_687_500,
      difference: 1_187_500,
      perGuest: 137_917,
      validUntil: "2026-12-15",
      currencyMismatch: false,
    });
    expect([...v.arithmeticFlags, ...v.ungroundedItems, v.ungroundedTotal]).toEqual([false]);
    expect(v.questions.map((q) => questionText(q, "en-IN"))).toEqual([
      "The line items add up to ₹10,000 less than your total. What is the difference for?",
      "What is the overtime charge after 11 pm?",
    ]);
  });

  it("unclear tax: asks about tax, the 10 missing guests and the unmentioned need (EM-33, EM-51)", () => {
    const v = sample("unclear-tax");
    expect(v).toMatchObject({ totalCheck: { kind: "adds_up" }, taxesAndFees: null, guestsShort: 10, needsCovered: 0, difference: -1_800_000 });
    expect(v.questions.map((q) => questionText(q, "en-IN"))).toEqual([
      "Do prices include tax?",
      "The quote covers 140 guests. What is the price for 150?",
      `Does the quote include this: ${NEED}?`,
      "How much would the price change if the menu changes?",
      "Is the 50% advance refundable if the event is cancelled?",
    ]);
  });

  it("different currency: left out of the comparison until the user enters a total (EM-50)", () => {
    const v = sample("other-currency");
    expect(v).toMatchObject({ currencyMismatch: true, total: 248_000, totalCheck: { kind: "adds_up" }, comparableTotal: null, difference: null });
    expect(v.ungroundedItems.size + Number(v.ungroundedTotal)).toBe(0);
    const converted = viewQuote({ ...v.quote, convertedTotal: 21_000_000 }, catering, plan);
    expect(converted).toMatchObject({ comparableTotal: 21_000_000, difference: 1_500_000 });
  });

  it("compares only what can be compared, cheapest first", () => {
    const views = ["hidden-charge", "unclear-tax", "other-currency"].map(sample);
    expect(comparableViews(views).map((v) => v.details.vendorName)).toEqual(["Marwar Kitchen Co.", "Saffron Table Caterers"]);
  });
});

describe("the total check (EM-49)", () => {
  it.each<[string, Partial<QuoteDetails>, string, unknown]>([
    ["equal", { items: [item(10_000), item(500, "tax")], statedTotal: 10_500 }, "INR", { kind: "adds_up" }],
    ["off by one rupee or less", { items: [item(10_000)], statedTotal: 10_100 }, "INR", { kind: "rounding", difference: 100 }],
    ["off by more", { items: [item(10_000)], statedTotal: 10_101 }, "INR", { kind: "gap", difference: 101 }],
    ["more items than total", { items: [item(10_000), item(5_000, "fee")], statedTotal: 12_000 }, "INR", { kind: "gap", difference: -3_000 }],
    ["discounts count", { items: [item(10_000), item(-1_000, "discount")], statedTotal: 9_000 }, "INR", { kind: "adds_up" }],
    ["JPY: off by one yen", { currency: "JPY", items: [item(10_000)], statedTotal: 10_001 }, "JPY", { kind: "rounding", difference: 1 }],
    ["JPY: off by two yen", { currency: "JPY", items: [item(10_000)], statedTotal: 10_002 }, "JPY", { kind: "gap", difference: 2 }],
    ["no stated total", { items: [item(10_000)] }, "INR", { kind: "no_stated_total" }],
    ["no line items", { statedTotal: 10_000 }, "INR", { kind: "no_items" }],
    ["nothing at all", {}, "INR", { kind: "no_total" }],
  ])("%s", (_name, d, currency, expected) => {
    expect(view(details(d), {}, makePlan({ currency, lines: [catering] })).totalCheck).toEqual(expected);
  });

  it("uses the calculated total when the quote states none, and asks for one", () => {
    const v = view(details({ items: [item(10_000), item(500, "fee")] }));
    expect(v.total).toBe(10_500);
    expect(v.questions).toContainEqual({ kind: "no_stated_total" });
  });

  it("shows Not stated (null), never 0, when there is nothing to add up (EM-33)", () => {
    expect(view(details())).toMatchObject({ base: null, taxesAndFees: null, total: null, comparableTotal: null, perGuest: null });
  });
});

describe("tax (EM-51)", () => {
  it("excluded with no tax line: the total is excl. tax, with a question", () => {
    const v = view(details({ taxTreatment: "excluded", items: [item(10_000)], statedTotal: 10_000 }));
    expect(v.exclTax).toBe(true);
    expect(v.questions).toContainEqual({ kind: "excl_tax" });
  });

  it("excluded with a tax line is fine", () => {
    expect(view(details({ taxTreatment: "excluded", items: [item(10_000), item(1_800, "tax")] })).exclTax).toBe(false);
  });
});

describe("value flags (Q3, Q4, Q5)", () => {
  it("Q3: flags an item whose quantity × unit price is off by more than one unit", () => {
    const d = details({ items: [item(15_000_000, "item", 150, 95_000), item(2_700_000, "item", 150, 18_000), item(100_100, "item", 1, 100_000)] });
    expect([...view(d, { manual: null, extraction: d }).arithmeticFlags]).toEqual([0]);
  });

  it("Q4: flags values that aren't written in the quote text", () => {
    const d = details({ items: [item(14_250_000), item(999_900)], statedTotal: 20_687_500 });
    const v = view(d, { manual: null, extraction: d, rawText: "Dinner ₹1,42,500. Total ₹2,06,875. Staff extra." });
    expect([...v.ungroundedItems]).toEqual([1]);
    expect(v.ungroundedTotal).toBe(false);
  });

  it("Q3 and Q4 don't apply to details the user entered", () => {
    const d = details({ items: [item(1, "item", 2, 3)] });
    const v = view(d);
    expect(v.arithmeticFlags.size + v.ungroundedItems.size).toBe(0);
  });

  it("Q5: a validity date that isn't a real date is dropped and flagged", () => {
    expect(view(details({ validUntil: "2026-02-30" }))).toMatchObject({ validUntil: null, validUntilFlag: true });
    expect(view(details({ validUntil: "2026-12-15" }))).toMatchObject({ validUntil: "2026-12-15", validUntilFlag: false });
  });

  it.each<[string, string, number]>([
    ["₹1,85,000", "INR", 18_500_000],
    ["Rs. 1,85,000.50", "INR", 18_500_050],
    ["1.234,50 €", "EUR", 123_450],
    ["€1,234.5", "EUR", 123_450],
    ["¥1,500", "JPY", 1_500],
    ["$2,480.00", "USD", 248_000],
    ["CHF 1'250", "CHF", 125_000],
  ])("reads %s as %s %i minor units", (text, currency, minor) => {
    expect(numbersInText(text, currency).has(minor)).toBe(true);
  });
});

describe("guests and needs (EM-30, EM-33)", () => {
  it("flags a quote covering fewer guests than the line", () => {
    expect(view(details({ guestsCovered: 140 }))).toMatchObject({ guestsShort: 10, lineGuests: 150 });
    expect(view(details({ guestsCovered: 160 })).guestsShort).toBeNull();
  });

  it("turns needs that aren't covered into questions", () => {
    const v = view(details({ needsCoverage: [{ need: "A", status: "covered" }, { need: "B", status: "not_covered" }, { need: "C", status: "not_mentioned" }] }));
    expect(v.needsCovered).toBe(1);
    expect(v.questions.map((q) => questionText(q, "en"))).toEqual(["Can you include this: B?", "Does the quote include this: C?"]);
  });
});

describe("converting the AI's reading to minor units", () => {
  it("keeps discounts negative and reads an unstated currency as the event's", () => {
    const d = detailsFromResponse(
      {
        vendorName: null,
        currency: null,
        items: [{ description: "Discount", kind: "discount", quantity: null, unitPrice: null, amount: -500.5 }],
        statedTotal: 1999.99,
        taxTreatment: "unclear",
        guestsCovered: null,
        inclusions: [],
        exclusions: [],
        needsCoverage: [],
        clarifications: [],
        validUntil: null,
      },
      "EUR",
    );
    expect(d).toMatchObject({ currency: "EUR", statedTotal: 199_999, items: [{ amount: -50_050 }] });
  });
});

describe("linking and confirming a quote (EM-41)", () => {
  it("links a quote: Vendor Quoted at the quote's total, then Confirmed only by the user", () => {
    const linked = linkQuote(plan, "catering", "q1", 20_687_500);
    const line = linked.lines[0];
    expect(line).toMatchObject({ label: "vendor_quoted", quoteId: "q1", unitCost: 137_916, amount: 20_687_400 });
    expect(confirmLine(linked, "catering").lines[0]?.label).toBe("confirmed");
  });

  it("refuses to link over a confirmed line, or a quote with no total", () => {
    const confirmed = confirmLine(plan, "catering");
    expect(() => linkQuote(confirmed, "catering", "q1", 100)).toThrow(/Un-confirm/);
    expect(() => linkQuote(plan, "catering", "q1", 0)).toThrow(/no total/);
  });

  it("deleting the linked quote returns the line to AI Estimate and keeps the amount", () => {
    const linked = linkQuote(plan, "catering", "q1", 20_687_500);
    expect(quoteDeleted(linked, "q1").lines[0]).toMatchObject({ label: "ai_estimate", quoteId: null, amount: 20_687_400 });
    expect(quoteDeleted(linked, "other")).toBe(linked);
  });
});
