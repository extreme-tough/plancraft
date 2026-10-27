import {
  PLAN_RULES,
  PlanRequestSchema,
  PlanResponseSchema,
  planRequestProblem,
  planRuleFailures,
  type PlanRequest,
  type PlanResponse,
} from "@/domain/plan-contract";
import type { AiCallSpec } from "../pipeline";
import { PLAN_SYSTEM, planUserPrompt } from "../prompts/plan";
import { toProviderSchema } from "../provider-schema";

/** POST /api/ai/plan (spec §7.3). The contract itself lives in src/domain/plan-contract.ts. */
export const PLAN_CALL: AiCallSpec<PlanRequest, PlanResponse> = {
  name: "plan",
  requestSchema: PlanRequestSchema,
  requestProblem: (request, now) => planRequestProblem(request, now.toISOString().slice(0, 10)),
  responseSchema: PlanResponseSchema,
  providerSchema: toProviderSchema(PlanResponseSchema),
  rules: planRuleFailures,
  ruleText: PLAN_RULES,
  system: PLAN_SYSTEM,
  user: planUserPrompt,
  temperature: 0.4,
  // A full plan (25 lines, 40 tasks) is ~6k tokens; the headroom covers LOW-level thinking.
  maxOutputTokens: 12_288,
  timeoutMs: 45_000,
};
