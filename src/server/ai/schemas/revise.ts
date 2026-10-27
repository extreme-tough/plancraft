import { daysBetween } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { applyOps } from "@/domain/proposal";
import {
  normalizeRevision,
  REVISION_RULES,
  ReviseInputSchema,
  RevisionResponseSchema,
  revisionRequestFor,
  revisionRuleFailures,
  type ReviseInput,
  type RevisionRequest,
  type RevisionResponse,
} from "@/domain/revision-contract";
import { constraintChanges, opsForChanges } from "@/domain/revision";
import { EventPlanSchema } from "@/domain/schemas";
import type { AiCallSpec, Caller } from "../pipeline";
import { REVISE_SYSTEM, reviseUserPrompt } from "../prompts/revise";
import { toProviderSchema } from "../provider-schema";

/** Reads users/{uid}/events/{eventId}; null when it doesn't exist. */
export type LoadPlan = (uid: string, eventId: string) => Promise<unknown | null>;

/**
 * POST /api/ai/revise (spec §7.4). The browser sends only the event ID, its version, the changes
 * and the request text; the server reads that user's own stored plan (so nobody can name another
 * user's event), applies the code-built changes, and asks for trade-offs on the result.
 */
export function reviseCall(loadPlan: LoadPlan): AiCallSpec<RevisionRequest, RevisionResponse, ReviseInput> {
  return {
    name: "revise",
    requestSchema: ReviseInputSchema,
    requestProblem: (input, now) => {
      if (Math.abs(daysBetween(now.toISOString().slice(0, 10), input.today)) > 1) return "Today's date doesn't match the server's.";
      if (input.changes.length === 0 && !input.requestText?.trim()) return "Describe a change, or change the budget, date or guests.";
      return null;
    },
    async prepare(input: ReviseInput, caller: Caller) {
      const stored = EventPlanSchema.safeParse(await loadPlan(caller.uid, input.eventId));
      if (!stored.success) {
        // Missing, another user's, or failing its invariants (e.g. a dependency loop): never sent on.
        return { ok: false, status: 409, code: "CONFLICT", message: "This event couldn't be read. Please reload it." };
      }
      const plan = stored.data;
      if (plan.version !== input.baseVersion) {
        return { ok: false, status: 409, code: "CONFLICT", message: "The plan changed since this proposal. Recalculate?" };
      }
      const ops = opsForChanges(input.changes, input.today);
      if (!ops.ok) return { ok: false, status: 400, code: "INVALID_REQUEST", message: ops.message };
      try {
        const after = applyOps(plan, ops.ops);
        const requestText = input.requestText?.trim() ? input.requestText.trim() : null;
        const request = revisionRequestFor(after, input.today, constraintChanges(plan, input.changes), requestText);
        // EM-52: the AI is called only for a free-text request, or when there is a shortfall.
        if (!requestText && request.shortfall === 0) {
          return { ok: false, status: 400, code: "INVALID_REQUEST", message: "Nothing needs trade-offs: the plan fits the new budget." };
        }
        return { ok: true, request };
      } catch (error) {
        return { ok: false, status: 400, code: "INVALID_REQUEST", message: error instanceof DomainError ? error.message : "That change isn't possible." };
      }
    },
    responseSchema: RevisionResponseSchema,
    providerSchema: toProviderSchema(RevisionResponseSchema),
    rules: revisionRuleFailures,
    normalize: normalizeRevision,
    ruleText: REVISION_RULES,
    system: REVISE_SYSTEM,
    user: reviseUserPrompt,
    temperature: 0.3,
    maxOutputTokens: 8_192,
    timeoutMs: 30_000,
  };
}
