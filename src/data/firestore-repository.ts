import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { ProposalSchema, type Proposal } from "@/domain/proposal";
import { EventPlanSchema, type EventPlan } from "@/domain/schemas";
import {
  CorruptDataError,
  EventNotFoundError,
  VersionConflictError,
  type EventRepository,
} from "./repository";

/**
 * Firestore storage for one signed-in user (EM-39, EM-59). Paths:
 *   users/{uid}/events/{eventId}
 *   users/{uid}/events/{eventId}/proposals/{proposalId}
 * Everything read is validated with Zod before use; everything written is validated first too,
 * and the security rules check the same shape and the version step on the server.
 */
export class FirestoreEventRepository implements EventRepository {
  constructor(
    private readonly db: Firestore,
    private readonly uid: string,
  ) {}

  private eventsPath(): string {
    return `users/${this.uid}/events`;
  }

  private eventRef(eventId: string) {
    return doc(this.db, this.eventsPath(), eventId);
  }

  private proposalsPath(eventId: string): string {
    return `${this.eventsPath()}/${eventId}/proposals`;
  }

  private parseEvent(path: string, data: unknown): EventPlan {
    const result = EventPlanSchema.safeParse(data);
    if (!result.success) throw new CorruptDataError(path, result.error.issues[0]?.message ?? "unknown");
    return result.data;
  }

  async getEvent(eventId: string): Promise<EventPlan | null> {
    const snapshot = await getDoc(this.eventRef(eventId));
    return snapshot.exists() ? this.parseEvent(snapshot.ref.path, snapshot.data()) : null;
  }

  async listEvents(): Promise<EventPlan[]> {
    const snapshot = await getDocs(collection(this.db, this.eventsPath()));
    return snapshot.docs.map((d) => this.parseEvent(d.ref.path, d.data()));
  }

  async createEvent(plan: EventPlan): Promise<EventPlan> {
    const stored = EventPlanSchema.parse({ ...plan, version: 0 });
    await setDoc(this.eventRef(stored.id), stored);
    return stored;
  }

  async saveEvent(next: EventPlan, expectedVersion: number): Promise<EventPlan> {
    const stored = EventPlanSchema.parse({ ...next, version: expectedVersion + 1 });
    const ref = this.eventRef(next.id);
    return runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new EventNotFoundError(next.id);
      const current = this.parseEvent(ref.path, snapshot.data());
      if (current.version !== expectedVersion) throw new VersionConflictError(current);
      transaction.set(ref, stored);
      return stored;
    });
  }

  async deleteEvent(eventId: string): Promise<void> {
    const proposals = await getDocs(collection(this.db, this.proposalsPath(eventId)));
    await Promise.all(proposals.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(this.eventRef(eventId));
  }

  subscribeEvent(
    eventId: string,
    onChange: (plan: EventPlan | null) => void,
    onError: (error: Error) => void,
  ): () => void {
    return onSnapshot(
      this.eventRef(eventId),
      (snapshot) => {
        try {
          onChange(snapshot.exists() ? this.parseEvent(snapshot.ref.path, snapshot.data()) : null);
        } catch (error) {
          onError(error as Error);
        }
      },
      onError,
    );
  }

  async getProposal(eventId: string, proposalId: string): Promise<Proposal | null> {
    const snapshot = await getDoc(doc(this.db, this.proposalsPath(eventId), proposalId));
    if (!snapshot.exists()) return null;
    const result = ProposalSchema.safeParse(snapshot.data());
    if (!result.success) throw new CorruptDataError(snapshot.ref.path, result.error.issues[0]?.message ?? "unknown");
    return result.data;
  }

  async listProposals(eventId: string): Promise<Proposal[]> {
    const snapshot = await getDocs(collection(this.db, this.proposalsPath(eventId)));
    return snapshot.docs.map((d) => {
      const result = ProposalSchema.safeParse(d.data());
      if (!result.success) throw new CorruptDataError(d.ref.path, result.error.issues[0]?.message ?? "unknown");
      return result.data;
    });
  }

  async saveProposal(proposal: Proposal): Promise<void> {
    const stored = ProposalSchema.parse(proposal);
    await setDoc(doc(this.db, this.proposalsPath(stored.eventId), stored.id), stored);
  }

  async deleteProposal(eventId: string, proposalId: string): Promise<void> {
    await deleteDoc(doc(this.db, this.proposalsPath(eventId), proposalId));
  }
}
