import { isIsoDate, type IsoDate } from "./dates";
import { formatMoneyWhole } from "./format";
import { lineGuests } from "./guests";
import { currencyExponent, type Minor } from "./money";
import { quoteDetails, type Quote, type QuoteDetails } from "./quote";
import type { BudgetLine, EventPlan } from "./schemas";

/**
 * Everything shown about a quote, calculated by code on read (spec §7.5 "What code calculates",
 * EM-32, EM-33, EM-49 to EM-51, Q3 to Q5). Nothing here is stored, and no AI figure is added up by
 * the AI: base, taxes and fees, totals and differences all come from the extracted line items.
 */

export type TotalCheck =
  | { kind: "adds_up" }
  /** Off by one major unit or less. */
  | { kind: "rounding"; difference: Minor }
  /** Stated total minus calculated total: positive means charges the items don't explain. */
  | { kind: "gap"; difference: Minor }
  | { kind: "no_stated_total" }
  | { kind: "no_items" }
  | { kind: "no_total" };

export type QuoteQuestion =
  | { kind: "gap"; difference: Minor; currency: string }
  | { kind: "no_stated_total" }
  | { kind: "tax_unclear" }
  | { kind: "excl_tax" }
  | { kind: "guests_short"; covered: number; expected: number }
  | { kind: "need"; need: string; status: "not_covered" | "not_mentioned" }
  /** The AI's own reading of what the quote leaves unclear (validated plain text). */
  | { kind: "clarification"; text: string };

export interface QuoteView {
  quote: Quote;
  details: QuoteDetails;
  /** Entered or corrected by hand, so Q3 and Q4 don't apply. */
  manual: boolean;
  /** EM-50: a different currency is left out of the comparison until the user enters a converted total. */
  currencyMismatch: boolean;
  /** Items + discounts, in the quote's currency. Null with no line items. */
  base: Minor | null;
  /** Fees + taxes. Null when the quote lists none. */
  taxesAndFees: Minor | null;
  calculatedTotal: Minor | null;
  /** The quote's own total: stated, or calculated when it states none (EM-49). */
  total: Minor | null;
  totalCheck: TotalCheck;
  /** EM-51: tax excluded and no tax line, so the total is "excl. tax". */
  exclTax: boolean;
  /** The total in the event currency, or null when it can't be compared (yet). */
  comparableTotal: Minor | null;
  /** comparableTotal − the line's amount (EM-32): positive is over. */
  difference: Minor | null;
  lineGuests: number | null;
  /** EM-33: how many guests short of the line's count the quote covers. */
  guestsShort: number | null;
  /** A rounded per-guest figure for display only. */
  perGuest: Minor | null;
  needsCovered: number;
  /** Q3: item indexes whose quantity × unit price doesn't match the amount. */
  arithmeticFlags: ReadonlySet<number>;
  /** Q4: item indexes with a value not found in the quote text, and the same for the stated total. */
  ungroundedItems: ReadonlySet<number>;
  ungroundedTotal: boolean;
  /** Q5: a real date, or null (flagged when the quote gave something that isn't one). */
  validUntil: IsoDate | null;
  validUntilFlag: boolean;
  /** EM-30: questions for the vendor, built from the checks. */
  questions: QuoteQuestion[];
}

const sum = (values: readonly Minor[]): Minor => values.reduce((total, value) => total + value, 0);

/**
 * Q4 grounding: every number written in the text, in minor units of `currency`. Separators are
 * removed; a final "." or "," followed by up to the currency's decimal places is also read as a
 * decimal mark, so "₹1,85,000", "2,100.00" and "1.234,50" are all found.
 */
export function numbersInText(text: string, currency: string): Set<Minor> {
  const exponent = currencyExponent(currency);
  const scale = 10 ** exponent;
  const found = new Set<Minor>();
  for (const token of text.match(/\d(?:[\d,.'’  ]*\d)?/g) ?? []) {
    const digits = token.replace(/\D/g, "");
    if (digits.length > 15) continue;
    const whole = Number(digits) * scale;
    if (Number.isSafeInteger(whole)) found.add(whole);
    const mark = Math.max(token.lastIndexOf("."), token.lastIndexOf(","));
    const fraction = mark >= 0 ? token.slice(mark + 1) : "";
    if (exponent > 0 && /^\d+$/.test(fraction) && fraction.length <= exponent) {
      const value = Number(token.slice(0, mark).replace(/\D/g, "")) * scale + Number(fraction.padEnd(exponent, "0"));
      if (Number.isSafeInteger(value)) found.add(value);
    }
  }
  return found;
}

function checkTotal(stated: Minor | null, calculated: Minor | null, currency: string): TotalCheck {
  if (calculated === null) return stated === null ? { kind: "no_total" } : { kind: "no_items" };
  if (stated === null) return { kind: "no_stated_total" };
  const difference = stated - calculated;
  if (difference === 0) return { kind: "adds_up" };
  if (Math.abs(difference) <= 10 ** currencyExponent(currency)) return { kind: "rounding", difference };
  return { kind: "gap", difference };
}

/** The checks for one quote against its line. Null when the quote hasn't been read or entered yet. */
export function viewQuote(quote: Quote, line: BudgetLine, plan: EventPlan): QuoteView | null {
  const details = quoteDetails(quote);
  if (!details) return null;
  const manual = quote.manual !== null;
  const { currency, items } = details;
  const scale = 10 ** currencyExponent(currency);

  const amounts = (kinds: readonly string[]): Minor[] => items.filter((item) => kinds.includes(item.kind)).map((item) => item.amount);
  const base = items.length === 0 ? null : sum(amounts(["item", "discount"]));
  // No fee or tax lines is "Not stated", not ₹0: the quote may simply not say (EM-33, EM-51).
  const feesAndTaxes = amounts(["fee", "tax"]);
  const taxesAndFees = feesAndTaxes.length === 0 ? null : sum(feesAndTaxes);
  const calculatedTotal = base === null ? null : base + (taxesAndFees ?? 0);
  const totalCheck = checkTotal(details.statedTotal, calculatedTotal, currency);
  const total = details.statedTotal ?? calculatedTotal;
  const exclTax = details.taxTreatment === "excluded" && !items.some((item) => item.kind === "tax");

  const currencyMismatch = currency !== plan.currency;
  const comparableTotal = currencyMismatch ? quote.convertedTotal : total;
  const guests = lineGuests(line, plan.guestCount);
  const guestsShort = guests !== null && details.guestsCovered !== null && details.guestsCovered < guests ? guests - details.guestsCovered : null;
  const perGuestCount = details.guestsCovered ?? guests;

  const arithmeticFlags = new Set<number>();
  const ungroundedItems = new Set<number>();
  let ungroundedTotal = false;
  if (!manual) {
    const written = numbersInText(quote.rawText, currency);
    const grounded = (value: Minor): boolean => value === 0 || written.has(Math.abs(value));
    items.forEach((item, i) => {
      // Q3: within one major unit.
      if (item.quantity !== null && item.unitPrice !== null && Math.abs(Math.round(item.quantity * item.unitPrice) - item.amount) > scale) {
        arithmeticFlags.add(i);
      }
      if (!grounded(item.amount) || (item.unitPrice !== null && !grounded(item.unitPrice))) ungroundedItems.add(i);
    });
    ungroundedTotal = details.statedTotal !== null && !grounded(details.statedTotal);
  }

  const validDate = details.validUntil !== null && isIsoDate(details.validUntil);

  const questions: QuoteQuestion[] = [];
  if (totalCheck.kind === "gap") questions.push({ kind: "gap", difference: totalCheck.difference, currency });
  if (totalCheck.kind === "no_stated_total") questions.push({ kind: "no_stated_total" });
  if (details.taxTreatment === "unclear") questions.push({ kind: "tax_unclear" });
  if (exclTax) questions.push({ kind: "excl_tax" });
  if (guestsShort !== null && guests !== null && details.guestsCovered !== null) {
    questions.push({ kind: "guests_short", covered: details.guestsCovered, expected: guests });
  }
  for (const { need, status } of details.needsCoverage) {
    if (status !== "covered") questions.push({ kind: "need", need, status });
  }
  for (const text of details.clarifications) questions.push({ kind: "clarification", text });

  return {
    quote,
    details,
    manual,
    currencyMismatch,
    base,
    taxesAndFees,
    calculatedTotal,
    total,
    totalCheck,
    exclTax,
    comparableTotal,
    difference: comparableTotal === null ? null : comparableTotal - line.amount,
    lineGuests: guests,
    guestsShort,
    perGuest: comparableTotal === null || perGuestCount === null ? null : Math.round(comparableTotal / perGuestCount),
    needsCovered: details.needsCoverage.filter((entry) => entry.status === "covered").length,
    arithmeticFlags,
    ungroundedItems,
    ungroundedTotal,
    validUntil: validDate ? details.validUntil : null,
    validUntilFlag: details.validUntil !== null && !validDate,
    questions,
  };
}

/** The question as the user would send it to the vendor (EM-30). */
export function questionText(question: QuoteQuestion, locale: string): string {
  switch (question.kind) {
    case "gap": {
      const amount = formatMoneyWhole(Math.abs(question.difference), question.currency, locale);
      return question.difference > 0
        ? `The line items add up to ${amount} less than your total. What is the difference for?`
        : `The line items add up to ${amount} more than your total. Which price applies?`;
    }
    case "no_stated_total":
      return "What is the total price, including all taxes and fees?";
    case "tax_unclear":
      return "Do prices include tax?";
    case "excl_tax":
      return "How much tax applies, and what is the total including tax?";
    case "guests_short":
      return `The quote covers ${question.covered.toLocaleString(locale)} guests. What is the price for ${question.expected.toLocaleString(locale)}?`;
    case "need":
      return question.status === "not_covered" ? `Can you include this: ${question.need}?` : `Does the quote include this: ${question.need}?`;
    case "clarification":
      return question.text;
  }
}

/**
 * The quotes that can be compared on price (EM-50), cheapest first. Ties keep the order they were
 * added. Quotes not yet read, or in another currency without a converted total, are left out.
 */
export function comparableViews(views: readonly QuoteView[]): QuoteView[] {
  return views.filter((view) => view.comparableTotal !== null).sort((a, b) => (a.comparableTotal as Minor) - (b.comparableTotal as Minor));
}
