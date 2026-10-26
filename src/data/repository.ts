import type { Proposal } from "@/domain/proposal";
import type { EventPlan } from "@/domain/schemas";

/**
 * Storage for one user's events and proposals. Two implementations: in memory (tests) and
 * Firestore (the app). Every plan write is version-checked (EM-62): it succeeds only if the stored
 * version is the one the caller last read, and it stores version + 1.
 */
export interface EventRepository {
  getEvent(eventId: string): Promise<EventPlan | null>;
  listEvents(): Promise<EventPlan[]>;
  /** Stores a brand-new event at version 0. */
  createEvent(plan: EventPlan): Promise<EventPlan>;
  /**
   * Replaces the event if its stored version is still `expectedVersion`; stores `expectedVersion + 1`.
   * Throws VersionConflictError (carrying the latest plan) when someone else saved first.
   */
  saveEvent(next: EventPlan, expectedVersion: number): Promise<EventPlan>;
  deleteEvent(eventId: string): Promise<void>;
  /** Live updates, so other people's edits in the shared demo appear without a reload (EM-62). */
  subscribeEvent(eventId: string, onChange: (plan: EventPlan | null) => void, onError: (error: Error) => void): () => void;

  getProposal(eventId: string, proposalId: string): Promise<Proposal | null>;
  listProposals(eventId: string): Promise<Proposal[]>;
  saveProposal(proposal: Proposal): Promise<void>;
  deleteProposal(eventId: string, proposalId: string): Promise<void>;
}

/** Someone else changed the event first (EM-62). The UI reloads `latest` and says so. */
export class VersionConflictError extends Error {
  constructor(readonly latest: EventPlan) {
    super("Someone else changed this event. You're now seeing the latest version.");
    this.name = "VersionConflictError";
  }
}

export class EventNotFoundError extends Error {
  constructor(readonly eventId: string) {
    super("This event no longer exists.");
    this.name = "EventNotFoundError";
  }
}

/** Stored data failed validation; it is never used or shown as if it were valid. */
export class CorruptDataError extends Error {
  constructor(readonly path: string, detail: string) {
    super(`Stored data at ${path} is invalid: ${detail}`);
    this.name = "CorruptDataError";
  }
}
