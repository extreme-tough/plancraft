import { DomainError } from "./errors";
import type { Minor } from "./money";
import { lineGuests } from "./guests";
import type { BudgetLine } from "./schemas";

/**
 * Cost labels (EM-19, EM-20, EM-41). Every transition here is a user action; no AI output and no
 * recalculation can call these. Only the user confirms or un-confirms a line.
 */
export type LabelEvent =
  | { type: "link_quote"; quoteId: string; total: Minor }
  | { type: "confirm" }
  | { type: "unconfirm" }
  | { type: "quote_deleted"; quoteId: string }
  | { type: "vendor_cancelled" };

export function transitionLabel(line: BudgetLine, event: LabelEvent, eventGuests: number): BudgetLine {
  const illegal = (): never => {
    throw new DomainError("illegal_transition", `Can't ${event.type} a line labelled ${line.label}`);
  };

  switch (event.type) {
    case "link_quote":
      if (line.label === "confirmed") illegal();
      return {
        ...line,
        label: "vendor_quoted",
        quoteId: event.quoteId,
        ...priceAt(line, event.total, eventGuests),
      };
    case "confirm":
      if (line.label === "confirmed") illegal();
      return { ...line, label: "confirmed" };
    case "unconfirm":
      if (line.label !== "confirmed") illegal();
      return { ...line, label: line.quoteId ? "vendor_quoted" : "ai_estimate" };
    case "quote_deleted":
      // A confirmed line keeps its label: the user confirmed the price, not the document.
      if (line.quoteId !== event.quoteId) return line;
      if (line.label === "confirmed") return { ...line, quoteId: null };
      return { ...line, label: "ai_estimate", quoteId: null };
    case "vendor_cancelled":
      if (line.label === "ai_estimate") illegal();
      return {
        ...line,
        label: "ai_estimate",
        quoteId: null,
        assumptions: ["Previous vendor's price", ...line.assumptions].slice(0, 3),
      };
  }
}

/**
 * Sets a line's amount to a quoted total. A per-guest line gets the unit cost that total implies,
 * rounded down to the minor unit so unit cost × guests stays exact (INV-9); the difference is at
 * most guests − 1 minor units (under ₹1.50 for 150 guests).
 */
function priceAt(line: BudgetLine, total: Minor, eventGuests: number): Pick<BudgetLine, "amount" | "unitCost"> {
  const guests = lineGuests(line, eventGuests);
  if (guests === null) return { amount: total, unitCost: null };
  const unitCost = Math.floor(total / guests);
  return { amount: unitCost * guests, unitCost };
}
