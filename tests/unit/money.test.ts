import { describe, expect, it } from "vitest";
import { allocateLargestRemainder, percentTenths } from "@/domain/allocation";
import { addDays, daysBetween, isIsoDate } from "@/domain/dates";
import { formatMoney, formatMoneyCompact } from "@/domain/format";
import { currencyExponent, decimalStringToMinor, isSupportedCurrency, majorNumberToMinor, minorToMajor } from "@/domain/money";

describe("currency exponents (EM-37)", () => {
  it.each([
    ["JPY", 0],
    ["INR", 2],
    ["EUR", 2],
    ["BHD", 3],
  ])("%s has %i decimals", (currency, exponent) => {
    expect(currencyExponent(currency)).toBe(exponent);
  });

  it("knows ISO 4217 codes", () => {
    expect(isSupportedCurrency("INR")).toBe(true);
    expect(isSupportedCurrency("XYZ")).toBe(false);
    expect(isSupportedCurrency("inr")).toBe(false);
  });
});

describe("conversions", () => {
  it("converts decimal strings exactly, rounding half up", () => {
    expect(decimalStringToMinor("8.005", "INR")).toBe(801);
    expect(decimalStringToMinor("8.004", "INR")).toBe(800);
    expect(decimalStringToMinor("1234", "JPY")).toBe(1234);
    expect(decimalStringToMinor("1.0005", "BHD")).toBe(1001);
  });

  it("converts the AI's major-unit numbers without float drift", () => {
    expect(majorNumberToMinor(0.1 + 0.2, "USD")).toBe(30);
    expect(majorNumberToMinor(2.675, "USD")).toBe(268);
    expect(majorNumberToMinor(800000, "INR")).toBe(80_000_000);
    expect(() => majorNumberToMinor(-1, "INR")).toThrow();
    expect(() => majorNumberToMinor(Number.NaN, "INR")).toThrow();
  });

  it("goes back to major units", () => {
    expect(minorToMajor(80_000_050, "INR")).toBe(800000.5);
    expect(minorToMajor(80_000, "JPY")).toBe(80000);
  });
});

describe("formatting for the user's locale (EM-37)", () => {
  it("uses Indian grouping in en-IN", () => {
    expect(formatMoney(80_000_000, "INR", "en-IN")).toBe("₹8,00,000.00");
    expect(formatMoneyCompact(80_000_000, "INR", "en-IN")).toBe("₹8,00,000");
  });

  it("uses the locale's separators and symbol position", () => {
    expect(formatMoneyCompact(800_000, "EUR", "de-DE")).toBe("8.000 €");
    expect(formatMoneyCompact(800_000, "USD", "en-US")).toBe("$8,000");
    expect(formatMoney(8_050, "USD", "en-US")).toBe("$80.50");
  });

  it("keeps decimals when they matter", () => {
    expect(formatMoneyCompact(80_000_050, "INR", "en-IN")).toBe("₹8,00,000.50");
  });
});

describe("allocateLargestRemainder (EM-14)", () => {
  it("adds up exactly and stays within one unit of each share", () => {
    expect(allocateLargestRemainder(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateLargestRemainder(80_000_000, [40, 35, 25])).toEqual([32_000_000, 28_000_000, 20_000_000]);
  });

  it("gives ties to the earlier weight", () => {
    expect(allocateLargestRemainder(5, [1, 1])).toEqual([3, 2]);
  });

  it("handles zero weights and empty input", () => {
    expect(allocateLargestRemainder(10, [0, 1])).toEqual([0, 10]);
    expect(allocateLargestRemainder(10, [])).toEqual([]);
  });

  it("refuses impossible input", () => {
    expect(() => allocateLargestRemainder(10, [0, 0])).toThrow();
    expect(() => allocateLargestRemainder(-1, [1])).toThrow();
    expect(() => allocateLargestRemainder(10, [-1, 2])).toThrow();
  });
});

describe("percentTenths (EM-44)", () => {
  it("adds up to exactly 100.0% when the parts make the whole", () => {
    const tenths = percentTenths([1, 1, 1], 3);
    expect(tenths.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("rounds each share otherwise", () => {
    expect(percentTenths([60, 60], 100)).toEqual([600, 600]);
    expect(percentTenths([5], 0)).toEqual([0]);
  });
});

describe("calendar dates (EM-55)", () => {
  it("adds days across months, years and leap days", () => {
    expect(addDays("2026-10-25", 7)).toBe("2026-11-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-10-25", "2027-02-22")).toBe(120);
    expect(daysBetween("2027-02-22", "2026-10-25")).toBe(-120);
  });

  it("rejects dates that don't exist", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(() => addDays("nope", 1)).toThrow();
  });
});
