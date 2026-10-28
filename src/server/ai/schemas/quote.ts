import {
  QUOTE_RULES,
  QuoteRequestSchema,
  QuoteResponseSchema,
  quoteRuleFailures,
  quoteTextProblem,
  type QuoteRequest,
  type QuoteResponse,
} from "@/domain/quote-contract";
import { isSupportedCurrency } from "@/domain/money";
import type { AiCallSpec } from "../pipeline";
import { QUOTE_SYSTEM, quoteUserPrompt } from "../prompts/quote";
import { toProviderSchema } from "../provider-schema";

/**
 * POST /api/ai/quote (spec §7.5). Q1 and Q2 fail the response; Q3 to Q5 only flag values, so they
 * run on read in src/domain/quote-checks.ts. Nothing is stored here: the browser saves the result.
 */
export const QUOTE_CALL: AiCallSpec<QuoteRequest, QuoteResponse> = {
  name: "quote",
  requestSchema: QuoteRequestSchema,
  requestProblem: (request) => {
    if (!isSupportedCurrency(request.eventCurrency)) return "The event's currency isn't recognised.";
    return quoteTextProblem(request.text);
  },
  responseSchema: QuoteResponseSchema,
  providerSchema: toProviderSchema(QuoteResponseSchema),
  rules: quoteRuleFailures,
  ruleText: QUOTE_RULES,
  system: QUOTE_SYSTEM,
  user: quoteUserPrompt,
  // Copying, not composing.
  temperature: 0,
  maxOutputTokens: 8_192,
  timeoutMs: 30_000,
};
