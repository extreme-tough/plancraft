import { z } from "zod";
import { AI_MONEY_MAX } from "./plan-contract";
import { lineGuests } from "./guests";
import { CategorySchema, type BudgetLine, type EventPlan } from "./schemas";

/**
 * The quote call's contract (spec §7.5): the request the browser sends, the response the model must
 * return, and the rules Q1–Q2 that fail a response. Q3–Q5 only flag values; they are calculated on
 * read in quote-checks.ts. Pure, so server and browser share it.
 */

export const QUOTE_TEXT_MIN = 50;
export const QUOTE_TEXT_MAX = 20_000;

export const QuoteRequestSchema = z.strictObject({
  text: z.string().min(QUOTE_TEXT_MIN).max(QUOTE_TEXT_MAX),
  eventCurrency: z.string().regex(/^[A-Z]{3}$/),
  line: z
    .strictObject({
      category: CategorySchema,
      name: z.string().max(80),
      guests: z.number().int().min(1).max(10_000).nullable(),
      needs: z.array(z.string().max(120)).max(5),
    })
    .nullable(),
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

/** EM-48: text with fewer than 50 non-whitespace characters is never sent to the AI. */
export function quoteTextProblem(text: string): string | null {
  if (text.replace(/\s/g, "").length < QUOTE_TEXT_MIN) return `Paste the quote's text: at least ${QUOTE_TEXT_MIN} characters, not counting spaces.`;
  if (text.length > QUOTE_TEXT_MAX) return `The quote is too long. Paste at most ${QUOTE_TEXT_MAX.toLocaleString("en")} characters.`;
  return null;
}

export function quoteRequestFor(plan: EventPlan, line: BudgetLine | null, text: string): QuoteRequest {
  return {
    text,
    eventCurrency: plan.currency,
    line: line && {
      category: line.category,
      name: line.name,
      guests: lineGuests(line, plan.guestCount),
      needs: [...line.vendorNeeds],
    },
  };
}

const AiMoney = z.number().finite().min(0).max(AI_MONEY_MAX);

export const QuoteItemKindSchema = z.enum(["item", "fee", "tax", "discount"]);
export const TaxTreatmentSchema = z.enum(["included", "excluded", "unclear"]);
export const NeedStatusSchema = z.enum(["covered", "not_covered", "not_mentioned"]);

export const QuoteResponseSchema = z.strictObject({
  vendorName: z.string().max(100).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  items: z
    .array(
      z.strictObject({
        description: z.string().min(1).max(120),
        kind: QuoteItemKindSchema,
        quantity: z.number().finite().min(0).max(1_000_000).nullable(),
        unitPrice: AiMoney.nullable(),
        amount: z.number().finite().min(-AI_MONEY_MAX).max(AI_MONEY_MAX),
      }),
    )
    .max(50),
  statedTotal: AiMoney.nullable(),
  taxTreatment: TaxTreatmentSchema,
  guestsCovered: z.number().int().min(1).max(100_000).nullable(),
  inclusions: z.array(z.string().max(120)).max(15),
  exclusions: z.array(z.string().max(120)).max(15),
  needsCoverage: z.array(z.strictObject({ need: z.string().max(120), status: NeedStatusSchema })).max(5),
  clarifications: z.array(z.string().max(200)).max(10),
  /** Q5 checks it is a real date on read; the schema only bounds it. */
  validUntil: z.string().max(40).nullable(),
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

export type QuoteRuleId = "Q1" | "Q2";

export const QUOTE_RULES: Readonly<Record<QuoteRuleId, string>> = {
  Q1: "Discount amounts are zero or negative; item, fee and tax amounts are zero or positive.",
  Q2: "needsCoverage has exactly one entry for each need in the request, with the need's text copied exactly.",
};

/** Q1 and Q2 (spec §7.5): either one makes the whole response invalid (repair attempt). */
export function quoteRuleFailures(response: QuoteResponse, request: QuoteRequest): QuoteRuleId[] {
  const failed: QuoteRuleId[] = [];
  if (response.items.some((item) => (item.kind === "discount" ? item.amount > 0 : item.amount < 0))) failed.push("Q1");

  const wanted = [...(request.line?.needs ?? [])].sort();
  const given = response.needsCoverage.map((entry) => entry.need).sort();
  if (wanted.length !== given.length || wanted.some((need, i) => need !== given[i])) failed.push("Q2");
  return failed;
}
