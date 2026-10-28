import { createEventPlan, validateAnswers, validateEventDetails } from "@/domain/event-input";
import { applyGeneratedPlan, planRequestFor } from "@/domain/plan-build";
import { detailsFromResponse, type Quote } from "@/domain/quote";
import { quoteRequestFor } from "@/domain/quote-contract";
import type { BudgetLine, EventPlan } from "@/domain/schemas";
import { jaipurWedding } from "@/demo/seed";
import { SAMPLE_QUOTES } from "@/demo/sample-quotes";
import { generateValidated } from "./ai/pipeline";
import type { AiProvider } from "./ai/provider";
import { PLAN_CALL } from "./ai/schemas/plan";
import { QUOTE_CALL } from "./ai/schemas/quote";
import { istDay } from "./rate-limit";

/**
 * EM-63: the nightly reset of the shared demo account, at 3:00 AM IST.
 * 1. Delete every event in the demo account (with its proposals and quotes).
 * 2. Write the demo persona's inputs (src/demo/seed.ts) as the pinned demo event, with no plan.
 * 3. Generate its plan through the plan call's own validation (§7.3), with the live AI.
 * 4. Add the three sample quotes (UX-10) to its catering line, each read by the quote call.
 * 5. Record when the reset ran, for the demo banner.
 * Nothing AI-made is stored in code (A27): the plan and the quote readings come from the model.
 * When the plan can't be generated, the event is left without one and the outcome is "no_plan";
 * the route answers 503 so Cloud Scheduler retries (3 times, 5 minutes apart: docs/setup.md §8).
 */

export interface ResetRecord {
  /** ISO timestamp. */
  at: string;
  outcome: ResetOutcome;
  eventId: string;
}

export type ResetOutcome = "ok" | "no_plan";

/** Where the reset writes: the demo account's events, and the reset record clients can't read. */
export interface DemoStore {
  eventIds(): Promise<string[]>;
  /** Deletes the event and everything under it. */
  deleteEvent(eventId: string): Promise<void>;
  writeEvent(plan: EventPlan): Promise<void>;
  writeQuote(eventId: string, quote: Quote): Promise<void>;
  recordReset(record: ResetRecord): Promise<void>;
}

export interface ResetDeps {
  store: DemoStore;
  provider: AiProvider;
  now: Date;
  newId: () => string;
}

export interface ResetResult extends ResetRecord {
  deleted: number;
  /** Plan-call rule IDs or failure code when there is no plan. Never text. */
  failed: string[];
  quotesRead: number;
}

/** The demo persona's event, built from inputs exactly as the event form would (EM-01, EM-02). */
export function pinnedDemoEvent(id: string, now: Date): EventPlan {
  const today = istDay(now);
  const inputs = jaipurWedding(today);
  const details = validateEventDetails(inputs.details, today, "en-IN");
  const answers = validateAnswers(inputs.answers);
  if (!details.ok || !answers.ok) throw new Error("The demo seed no longer passes the event form's validation.");
  return { ...createEventPlan({ id, details: details.value, answers: answers.value, isDemo: true }), demoPinned: true };
}

/** The line the sample quotes belong to: the main event's catering line, else any catering line. */
export function sampleQuoteLine(plan: EventPlan): BudgetLine | null {
  const catering = plan.lines.filter((line) => line.category === "catering");
  return catering.find((line) => line.partId === null) ?? catering[0] ?? null;
}

export async function resetDemo({ store, provider, now, newId }: ResetDeps): Promise<ResetResult> {
  const existing = await store.eventIds();
  for (const eventId of existing) await store.deleteEvent(eventId);

  const event = pinnedDemoEvent(newId(), now);
  await store.writeEvent(event);
  const record = (outcome: ResetOutcome): ResetRecord => ({ at: now.toISOString(), outcome, eventId: event.id });

  const generated = await generateValidated(PLAN_CALL, planRequestFor(event, istDay(now)), provider);
  if (!generated.ok) {
    await store.recordReset(record("no_plan"));
    return { ...record("no_plan"), deleted: existing.length, failed: [generated.code, ...generated.failed], quotesRead: 0 };
  }
  const plan = { ...applyGeneratedPlan(event, generated.data, newId), version: 1 };
  await store.writeEvent(plan);

  let quotesRead = 0;
  const line = sampleQuoteLine(plan);
  if (line) {
    const quotes = SAMPLE_QUOTES.map((sample, i): Quote => ({
      id: newId(),
      lineId: line.id,
      source: "paste",
      rawText: sample.text,
      extraction: null,
      manual: null,
      convertedTotal: null,
      cancelled: false,
      note: "",
      // Keeps the samples in their usual order (quotes are listed oldest first).
      createdAt: new Date(now.getTime() + i).toISOString(),
    }));
    // A quote the AI can't read is kept unread: the first visitor sees "Read the quote" (spec §7.6).
    const read = await Promise.all(
      quotes.map(async (quote) => {
        const result = await generateValidated(QUOTE_CALL, quoteRequestFor(plan, line, quote.rawText), provider);
        return result.ok ? { ...quote, extraction: detailsFromResponse(result.data, plan.currency) } : quote;
      }),
    );
    for (const quote of read) await store.writeQuote(plan.id, quote);
    quotesRead = read.filter((quote) => quote.extraction !== null).length;
  }

  await store.recordReset(record("ok"));
  return { ...record("ok"), deleted: existing.length, failed: [], quotesRead };
}
