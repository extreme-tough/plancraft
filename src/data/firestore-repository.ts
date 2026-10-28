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
import { QuoteSchema, type Quote } from "@/domain/quote";
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
 *   users/{uid}/events/{eventId}/quotes/{quoteId}
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

  private quotesPath(eventId: string): string {
    return `${this.eventsPath()}/${eventId}/quotes`;
  }

  /** Valid quotes, oldest first. An invalid document is never shown as if it were valid. */
  private parseQuotes(docs: ReadonlyArray<{ data(): unknown }>): Quote[] {
    return docs
      .flatMap((d) => {
        const result = QuoteSchema.safeParse(d.data());
        return result.success ? [result.data] : [];
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
    const [proposals, quotes] = await Promise.all([
      getDocs(collection(this.db, this.proposalsPath(eventId))),
      getDocs(collection(this.db, this.quotesPath(eventId))),
    ]);
    await Promise.all([...proposals.docs, ...quotes.docs].map((d) => deleteDoc(d.ref)));
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

  async listQuotes(eventId: string): Promise<Quote[]> {
    return this.parseQuotes((await getDocs(collection(this.db, this.quotesPath(eventId)))).docs);
  }

  subscribeQuotes(eventId: string, onChange: (quotes: Quote[]) => void, onError: (error: Error) => void): () => void {
    return onSnapshot(collection(this.db, this.quotesPath(eventId)), (snapshot) => onChange(this.parseQuotes(snapshot.docs)), onError);
  }

  async saveQuote(eventId: string, quote: Quote): Promise<void> {
    const stored = QuoteSchema.parse(quote);
    await setDoc(doc(this.db, this.quotesPath(eventId), stored.id), stored);
  }

  async deleteQuote(eventId: string, quoteId: string): Promise<void> {
    await deleteDoc(doc(this.db, this.quotesPath(eventId), quoteId));
  }
}
