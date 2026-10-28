import { z } from "zod";
import { isSupportedCurrency, majorNumberToMinor, type Minor } from "./money";
import { NeedStatusSchema, QuoteItemKindSchema, TaxTreatmentSchema, type QuoteResponse } from "./quote-contract";
import { IdSchema, MinorSchema } from "./schemas";

/**
 * A stored quote (spec §8.5): users/{uid}/events/{eventId}/quotes/{quoteId}, one document each, so
 * raw text (up to 20,000 characters) never weighs down the event document. Money is stored in the
 * quote's own currency's minor units; totals, checks and flags are calculated on read.
 */

export const QuoteDetailsSchema = z.object({
  vendorName: z.string().max(100).nullable(),
  /** The quote's currency; the event's when the quote didn't say. */
  currency: z.string().regex(/^[A-Z]{3}$/),
  items: z
    .array(
      z.object({
        description: z.string().min(1).max(120),
        kind: QuoteItemKindSchema,
        quantity: z.number().finite().min(0).nullable(),
        unitPrice: MinorSchema.nullable(),
        amount: MinorSchema,
      }),
    )
    .max(50),
  statedTotal: MinorSchema.nullable(),
  taxTreatment: TaxTreatmentSchema,
  guestsCovered: z.number().int().min(1).max(100_000).nullable(),
  inclusions: z.array(z.string().max(120)).max(15),
  exclusions: z.array(z.string().max(120)).max(15),
  needsCoverage: z.array(z.object({ need: z.string().max(120), status: NeedStatusSchema })).max(5),
  clarifications: z.array(z.string().max(200)).max(10),
  validUntil: z.string().max(40).nullable(),
});
export type QuoteDetails = z.infer<typeof QuoteDetailsSchema>;
export type QuoteItem = QuoteDetails["items"][number];

export const QuoteSchema = z.object({
  id: IdSchema,
  lineId: IdSchema.nullable(),
  source: z.enum(["paste", "docx", "pdf"]),
  rawText: z.string().min(1).max(20_000),
  /** The validated AI reading, null until read (or when it failed). */
  extraction: QuoteDetailsSchema.nullable(),
  /** Entered or corrected by hand; replaces the extraction when set (spec §7.6). */
  manual: QuoteDetailsSchema.nullable(),
  /** EM-50: the user's own total in the event currency, for a quote in another currency. */
  convertedTotal: MinorSchema.nullable(),
  /** EM-47. */
  cancelled: z.boolean(),
  /** EM-66. */
  note: z.string().max(1000),
  createdAt: z.string().max(40),
});
export type Quote = z.infer<typeof QuoteSchema>;

/** The details the checks run on: the user's own entry wins over the AI's reading. */
export function quoteDetails(quote: Quote): QuoteDetails | null {
  return quote.manual ?? quote.extraction;
}

function signedMinor(major: number, currency: string): Minor {
  const minor = majorNumberToMinor(Math.abs(major), currency);
  return major < 0 ? -minor : minor;
}

/**
 * The validated AI response in minor units (spec §7.5, "conversion to minor units"). A currency the
 * quote didn't state, or one Intl doesn't know, is read as the event's own.
 */
export function detailsFromResponse(response: QuoteResponse, eventCurrency: string): QuoteDetails {
  const currency = response.currency && isSupportedCurrency(response.currency) ? response.currency : eventCurrency;
  const minor = (major: number): Minor => signedMinor(major, currency);
  return {
    vendorName: response.vendorName,
    currency,
    items: response.items.map((item) => ({
      description: item.description,
      kind: item.kind,
      quantity: item.quantity,
      unitPrice: item.unitPrice === null ? null : minor(item.unitPrice),
      amount: minor(item.amount),
    })),
    statedTotal: response.statedTotal === null ? null : minor(response.statedTotal),
    taxTreatment: response.taxTreatment,
    guestsCovered: response.guestsCovered,
    inclusions: response.inclusions,
    exclusions: response.exclusions,
    needsCoverage: response.needsCoverage,
    clarifications: response.clarifications,
    validUntil: response.validUntil,
  };
}
