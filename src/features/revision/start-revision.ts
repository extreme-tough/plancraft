"use client";

import type { EventRepository } from "@/data/repository";
import type { Proposal } from "@/domain/proposal";
import { constraintChanges, opsForChanges, type ChangeInput } from "@/domain/revision";
import type { EventPlan } from "@/domain/schemas";

/**
 * Starts a revision (EM-27, EM-08, EM-52): at most one is pending (§8.6), so any older one is
 * deleted first. The proposal records the plan version it was built on (EM-56) and changes nothing
 * in the plan until Apply (EM-53). Returns the new proposal's id.
 */
export async function startRevision(
  repository: EventRepository,
  plan: EventPlan,
  today: string,
  changes: readonly ChangeInput[],
  requestText: string | null,
): Promise<string> {
  const ops = opsForChanges(changes, today);
  if (!ops.ok) throw new Error(ops.message);
  const existing = await repository.listProposals(plan.id);
  await Promise.all(existing.filter((p) => p.kind === "revision").map((p) => repository.deleteProposal(plan.id, p.id)));

  const proposal: Proposal = {
    id: crypto.randomUUID(),
    eventId: plan.id,
    kind: "revision",
    name: null,
    baseVersion: plan.version,
    changes: constraintChanges(plan, changes),
    requestText: requestText?.trim() ? requestText.trim() : null,
    deterministicOps: ops.ops,
    options: [],
    interpretation: null,
    assumptions: [],
    selectedOption: null,
  };
  await repository.saveProposal(proposal);
  return proposal.id;
}
