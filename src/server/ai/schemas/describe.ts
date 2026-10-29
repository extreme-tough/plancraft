import {
  DESCRIBE_RULES,
  DescribeRequestSchema,
  DescribeResponseSchema,
  describeTextProblem,
  normalizeDescribed,
  type DescribeRequest,
  type DescribeResponse,
} from "@/domain/describe-contract";
import type { AiCallSpec } from "../pipeline";
import { DESCRIBE_SYSTEM, describeUserPrompt } from "../prompts/describe";
import { toProviderSchema } from "../provider-schema";

/**
 * POST /api/ai/describe (AI-13). No rule fails the response: values code can't trust are dropped
 * one by one (normalizeDescribed). Nothing is stored: the browser fills the form's empty fields.
 */
export const DESCRIBE_CALL: AiCallSpec<DescribeRequest, DescribeResponse> = {
  name: "describe",
  requestSchema: DescribeRequestSchema,
  requestProblem: (request) => describeTextProblem(request.text),
  responseSchema: DescribeResponseSchema,
  providerSchema: toProviderSchema(DescribeResponseSchema),
  rules: () => [],
  normalize: normalizeDescribed,
  ruleText: DESCRIBE_RULES,
  system: DESCRIBE_SYSTEM,
  user: describeUserPrompt,
  // Copying, not composing.
  temperature: 0,
  maxOutputTokens: 4_096,
  timeoutMs: 30_000,
};
