import { ProposalSchema, type Proposal } from "@/domain/proposal";
import { EventPlanSchema, type EventPlan } from "@/domain/schemas";
import { EventNotFoundError, VersionConflictError, type EventRepository } from "./repository";

/** In-memory repository with the same contract as Firestore, for tests. Values are copied in and out. */
export class MemoryEventRepository implements EventRepository {
  private readonly events = new Map<string, EventPlan>();
  private readonly proposals = new Map<string, Proposal>();
  private readonly listeners = new Map<string, Set<(plan: EventPlan | null) => void>>();

  async getEvent(eventId: string): Promise<EventPlan | null> {
    const plan = this.events.get(eventId);
    return plan ? structuredClone(plan) : null;
  }

  async listEvents(): Promise<EventPlan[]> {
    return [...this.events.values()].map((plan) => structuredClone(plan));
  }

  async createEvent(plan: EventPlan): Promise<EventPlan> {
    const stored = EventPlanSchema.parse({ ...plan, version: 0 });
    if (this.events.has(stored.id)) throw new Error(`Event ${stored.id} already exists`);
    this.events.set(stored.id, stored);
    this.notify(stored.id);
    return structuredClone(stored);
  }

  async saveEvent(next: EventPlan, expectedVersion: number): Promise<EventPlan> {
    const current = this.events.get(next.id);
    if (!current) throw new EventNotFoundError(next.id);
    if (current.version !== expectedVersion) throw new VersionConflictError(structuredClone(current));
    const stored = EventPlanSchema.parse({ ...next, version: expectedVersion + 1 });
    this.events.set(stored.id, stored);
    this.notify(stored.id);
    return structuredClone(stored);
  }

  async deleteEvent(eventId: string): Promise<void> {
    this.events.delete(eventId);
    for (const key of this.proposals.keys()) if (key.startsWith(`${eventId}/`)) this.proposals.delete(key);
    this.notify(eventId);
  }

  subscribeEvent(eventId: string, onChange: (plan: EventPlan | null) => void): () => void {
    const set = this.listeners.get(eventId) ?? new Set();
    set.add(onChange);
    this.listeners.set(eventId, set);
    onChange(this.events.has(eventId) ? structuredClone(this.events.get(eventId) as EventPlan) : null);
    return () => set.delete(onChange);
  }

  async getProposal(eventId: string, proposalId: string): Promise<Proposal | null> {
    const proposal = this.proposals.get(`${eventId}/${proposalId}`);
    return proposal ? structuredClone(proposal) : null;
  }

  async listProposals(eventId: string): Promise<Proposal[]> {
    return [...this.proposals.entries()]
      .filter(([key]) => key.startsWith(`${eventId}/`))
      .map(([, proposal]) => structuredClone(proposal));
  }

  async saveProposal(proposal: Proposal): Promise<void> {
    const stored = ProposalSchema.parse(proposal);
    this.proposals.set(`${stored.eventId}/${stored.id}`, stored);
  }

  async deleteProposal(eventId: string, proposalId: string): Promise<void> {
    this.proposals.delete(`${eventId}/${proposalId}`);
  }

  private notify(eventId: string): void {
    const plan = this.events.get(eventId);
    for (const listener of this.listeners.get(eventId) ?? []) listener(plan ? structuredClone(plan) : null);
  }
}
