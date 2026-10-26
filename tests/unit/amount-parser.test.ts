import { describe, expect, it } from "vitest";
import { parseAmount } from "@/domain/amount-parser";

/** EM-38: amounts as people type them. Expected values are in minor units. */
describe("parseAmount", () => {
  const ok: Array<[input: string, currency: string, minor: number]> = [
    ["800000", "INR", 80_000_000],
    ["8 lakh", "INR", 80_000_000],
    ["8 lakhs", "INR", 80_000_000],
    ["8L", "INR", 80_000_000],
    ["8 lac", "INR", 80_000_000],
    ["1.5 crore", "INR", 1_500_000_000],
    ["2 cr", "INR", 2_000_000_000],
    ["₹8,00,000", "INR", 80_000_000],
    ["Rs 8,00,000", "INR", 80_000_000],
    ["Rs. 15 lakh", "INR", 150_000_000],
    ["8,00,000.50", "INR", 80_000_050],
    ["INR 8 lakh", "INR", 80_000_000],
    ["15k", "USD", 1_500_000],
    ["15 thousand", "USD", 1_500_000],
    ["$12,500", "USD", 1_250_000],
    ["$12,500.75", "USD", 1_250_075],
    ["2.5m", "USD", 250_000_000],
    ["1.2 million", "USD", 120_000_000],
    ["€8.000", "EUR", 800_000],
    ["8.000,50 €", "EUR", 800_050],
    ["8 000,50", "EUR", 800_050],
    ["1'250.40", "CHF", 125_040],
    ["12.5", "EUR", 1_250],
    ["¥80,000", "JPY", 80_000],
    ["￥80,000", "JPY", 80_000],
    ["0", "INR", 0],
  ];

  it.each(ok)("reads %j in %s", (input, currency, minor) => {
    expect(parseAmount(input, currency)).toEqual({ kind: "ok", minor });
  });

  it("rounds half up below the currency's smallest unit", () => {
    expect(parseAmount("10.5", "JPY")).toEqual({ kind: "ok", minor: 11 });
    expect(parseAmount("1,999.995", "USD")).toEqual({ kind: "ok", minor: 200_000 });
    expect(parseAmount("1.05 lakh", "INR")).toEqual({ kind: "ok", minor: 10_500_000 });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["-500", "negative"],
    ["(500)", "negative"],
    ["eight lakh", "invalid"],
    ["8 lakh 5", "invalid"],
    ["8 5", "invalid"],
    ["8..5", "invalid"],
    ["8,", "invalid"],
    ["lakh", "invalid"],
  ])("refuses %j as %s", (input, code) => {
    expect(parseAmount(input, "INR")).toMatchObject({ kind: "error", code });
  });

  it("refuses another currency instead of converting it", () => {
    expect(parseAmount("$500", "INR")).toEqual({ kind: "error", code: "currency_mismatch", foundCurrency: "USD" });
    expect(parseAmount("500 EUR", "INR")).toEqual({ kind: "error", code: "currency_mismatch", foundCurrency: "EUR" });
    expect(parseAmount("₹500", "USD")).toEqual({ kind: "error", code: "currency_mismatch", foundCurrency: "INR" });
  });

  it("accepts the dollar sign for any dollar currency", () => {
    expect(parseAmount("$500", "AUD")).toEqual({ kind: "ok", minor: 50_000 });
  });

  it("asks rather than guesses for three-decimal currencies (A17)", () => {
    expect(parseAmount("8.000", "BHD")).toEqual({ kind: "error", code: "ambiguous" });
    expect(parseAmount("8.5", "BHD")).toEqual({ kind: "ok", minor: 8_500 });
  });

  it("refuses amounts above the product's limit", () => {
    expect(parseAmount("200000 crore", "INR")).toEqual({ kind: "error", code: "too_large" });
  });
});
