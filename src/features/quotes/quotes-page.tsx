"use client";

import { ArrowLeft, CircleCheck, FileText, Link2, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { confirmLine, linkQuote, quoteDeleted } from "@/domain/edits";
import { formatMoneyWhole } from "@/domain/format";
import { lineGuests } from "@/domain/guests";
import { detailsFromResponse, type Quote, type QuoteDetails } from "@/domain/quote";
import { comparableViews, viewQuote, type QuoteView } from "@/domain/quote-checks";
import { QuoteResponseSchema, quoteRequestFor } from "@/domain/quote-contract";
import type { BudgetLine, EventPlan } from "@/domain/schemas";
import { useSignedIn } from "@/features/auth/auth-provider";
import { LabelBadge } from "@/features/dashboard/budget-lines";
import { usePlanEditor } from "@/features/dashboard/use-plan-editor";
import { callAi } from "@/lib/ai-client";
import { CATEGORY_TEXT } from "@/lib/display-names";
import { useLocale } from "@/lib/locale";
import { AddQuoteSheet } from "./add-quote-sheet";
import { ComparisonTable } from "./comparison-table";
import { ManualQuoteSheet } from "./manual-quote-sheet";
import { QuoteCard, vendorTitle, type Reading } from "./quote-card";
import { QuestionsPanel } from "./questions-panel";

/** Enough to compare a line's options without letting one visitor fill the shared demo. */
const MAX_QUOTES_PER_LINE = 6;

type Load = { state: "loading" } | { state: "missing" } | { state: "error" } | { state: "ready"; plan: EventPlan };

/** Figma "Vendor Quote Comparison" (EM-31 to EM-36, EM-49 to EM-51): quotes for one budget line. */
export function QuotesPage({ eventId, lineId }: { eventId: string; lineId: string | null }): React.ReactElement {
  const { repository } = useSignedIn();
  const locale = useLocale();
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(
    () =>
      repository.subscribeEvent(
        eventId,
        (plan) => setLoad(plan ? { state: "ready", plan } : { state: "missing" }),
        () => setLoad({ state: "error" }),
      ),
    [repository, eventId],
  );

  return (
    <div className="flex flex-col gap-6 pb-28">
      <Link href={`/events/${eventId}`} className="inline-flex items-center gap-1 self-start rounded-md text-accent-foreground text-sm underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to the plan
      </Link>
      <div aria-live="polite">
        {load.state === "loading" && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
            Loading the event…
          </p>
        )}
        {load.state === "missing" && (
          <Alert variant="warning">
            <AlertTitle>Event not found</AlertTitle>
            <AlertDescription>It may have been deleted, or it belongs to another account.</AlertDescription>
          </Alert>
        )}
        {load.state === "error" && (
          <Alert variant="error">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>This event couldn&apos;t be loaded. Please reload the page.</AlertDescription>
          </Alert>
        )}
      </div>
      {load.state === "ready" && <LineQuotes stored={load.plan} lineId={lineId} locale={locale} />}
    </div>
  );
}

function LinePicker({ plan, locale }: { plan: EventPlan; locale: string }): React.ReactElement {
  return (
    <section aria-labelledby="pick-line-heading" className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-card sm:p-6">
      <div>
        <h1 id="pick-line-heading" className="font-bold text-2xl">
          Compare quotes
        </h1>
        <p className="text-muted-foreground">Quotes are compared within one budget line. Pick the line they are for.</p>
      </div>
      {plan.lines.length === 0 ? (
        <p>This plan has no budget lines yet. Add one on the plan first.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {plan.lines.map((line) => (
            <li key={line.id}>
              <Link
                href={`/events/${plan.id}/quotes?line=${encodeURIComponent(line.id)}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 hover:bg-accent/50"
              >
                <span className="font-medium">
                  {line.name} <span className="text-muted-foreground text-sm">· {CATEGORY_TEXT[line.category]}</span>
                </span>
                <span className="tabular-nums">{formatMoneyWhole(line.amount, plan.currency, locale)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** EM-32: each quote's total against the line amount, as bars with the values in text. */
function Benchmark({ line, views, titles, plan, locale }: { line: BudgetLine; views: readonly QuoteView[]; titles: ReadonlyMap<string, string>; plan: EventPlan; locale: string }): React.ReactElement {
  const max = Math.max(line.amount, ...views.map((view) => view.comparableTotal ?? 0), 1);
  const whole = (minor: number): string => formatMoneyWhole(minor, plan.currency, locale);
  return (
    <ul className="flex flex-col gap-3" aria-label="Quote totals against the line">
      {views.map((view) => {
        const total = view.comparableTotal as number;
        return (
          <li key={view.quote.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap justify-between gap-x-3 text-sm">
              <span className="wrap-anywhere font-medium">{titles.get(view.quote.id)}</span>
              <span className="tabular-nums">
                {whole(total)} · {total === line.amount ? "matches the line" : total > line.amount ? `${whole(total - line.amount)} over` : `${whole(line.amount - total)} under`}
              </span>
            </div>
            <div aria-hidden="true" className="relative h-2.5 rounded-full bg-muted">
              <div className={`h-full rounded-full ${total > line.amount ? "bg-destructive/70" : "bg-primary"}`} style={{ width: `${(total / max) * 100}%` }} />
              <div className="absolute -top-1 h-4.5 w-0.5 bg-foreground" style={{ insetInlineStart: `${(line.amount / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function LineQuotes({ stored, lineId, locale }: { stored: EventPlan; lineId: string | null; locale: string }): React.ReactElement {
  const { repository, user } = useSignedIn();
  const editor = usePlanEditor(stored);
  const plan = editor.plan;
  const line = plan.lines.find((l) => l.id === lineId) ?? null;
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [quotesError, setQuotesError] = useState(false);
  const [reading, setReading] = useState<ReadonlyMap<string, Reading>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ kind: "add" } | { kind: "manual"; quoteId: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => repository.subscribeQuotes(plan.id, setQuotes, () => setQuotesError(true)), [repository, plan.id]);

  const lineQuotes = useMemo(() => (quotes ?? []).filter((quote) => line !== null && quote.lineId === line.id), [quotes, line]);
  const views = useMemo(
    () => new Map(lineQuotes.map((quote) => [quote.id, line ? viewQuote(quote, line, plan) : null])),
    [lineQuotes, line, plan],
  );
  const titles = useMemo(() => new Map(lineQuotes.map((quote, i) => [quote.id, vendorTitle(views.get(quote.id) ?? null, i)])), [lineQuotes, views]);
  const readViews = lineQuotes.flatMap((quote) => views.get(quote.id) ?? []);
  const comparable = comparableViews(readViews);

  // The linked quote starts selected.
  const linkedId = line?.quoteId ?? null;
  useEffect(() => {
    if (linkedId) setSelected((current) => current ?? linkedId);
  }, [linkedId]);

  const setReadingFor = (quoteId: string, value: Reading | null): void =>
    setReading((current) => {
      const next = new Map(current);
      if (value) next.set(quoteId, value);
      else next.delete(quoteId);
      return next;
    });

  const read = useCallback(
    async (quote: Quote): Promise<void> => {
      if (!line) return;
      setReadingFor(quote.id, { state: "working" });
      const result = await callAi("/api/ai/quote", quoteRequestFor(plan, line, quote.rawText), QuoteResponseSchema, (force) => user.getIdToken(force));
      if (!result.ok) return setReadingFor(quote.id, { state: "error", error: result.error });
      try {
        await repository.saveQuote(plan.id, { ...quote, extraction: detailsFromResponse(result.data, plan.currency) });
        setReadingFor(quote.id, null);
      } catch {
        setReadingFor(quote.id, {
          state: "error",
          error: { code: "SAVE_FAILED", message: "The quote was read but couldn't be saved. Check your connection.", retryable: true, retryAfterSeconds: null },
        });
      }
    },
    [line, plan, repository, user],
  );

  if (!line) return <LinePicker plan={plan} locale={locale} />;

  const add = async (text: string): Promise<boolean> => {
    const quote: Quote = {
      id: crypto.randomUUID(),
      lineId: line.id,
      source: "paste",
      rawText: text,
      extraction: null,
      manual: null,
      convertedTotal: null,
      cancelled: false,
      note: "",
      createdAt: new Date().toISOString(),
    };
    setAdding(true);
    try {
      await repository.saveQuote(plan.id, quote);
    } catch {
      setMessage("The quote couldn't be saved. Check your connection and try again.");
      return false;
    } finally {
      setAdding(false);
    }
    void read(quote);
    return true;
  };

  const saveManual = async (quote: Quote, details: QuoteDetails): Promise<boolean> => {
    try {
      await repository.saveQuote(plan.id, { ...quote, manual: details });
      setReadingFor(quote.id, null);
      return true;
    } catch {
      setMessage("The details couldn't be saved. Check your connection and try again.");
      return false;
    }
  };

  const remove = async (quote: Quote, title: string): Promise<void> => {
    // EM-41: unlink first, so the line never points at a missing quote.
    if (plan.lines.some((l) => l.quoteId === quote.id) && !(await editor.edit(`deleting the quote from ${title}`, (p) => quoteDeleted(p, quote.id)))) return;
    try {
      await repository.deleteQuote(plan.id, quote.id);
      if (selected === quote.id) setSelected(null);
      setMessage(`Deleted the quote from ${title}.`);
    } catch {
      setMessage("The quote couldn't be deleted. Check your connection and try again.");
    }
  };

  const chosen = selected ? (views.get(selected) ?? null) : null;
  const chosenTitle = chosen ? (titles.get(chosen.quote.id) ?? "") : "";

  const link = async (confirm: boolean): Promise<void> => {
    if (!chosen || chosen.comparableTotal === null) return;
    const total = chosen.comparableTotal;
    const quoteId = chosen.quote.id;
    const saved = await editor.edit(`linking the quote from ${chosenTitle}`, (p) => {
      const linked = linkQuote(p, line.id, quoteId, total);
      return confirm ? confirmLine(linked, line.id) : linked;
    });
    if (saved) {
      setMessage(
        confirm
          ? `${line.name} is now Confirmed, using the quote from ${chosenTitle}.`
          : `${line.name} is now Vendor Quoted (Unverified), using the quote from ${chosenTitle}.`,
      );
    }
  };

  const confirmOnly = async (): Promise<void> => {
    if (await editor.edit(`confirming ${line.name}`, (p) => confirmLine(p, line.id))) setMessage(`${line.name} is now Confirmed.`);
  };

  const guests = lineGuests(line, plan.guestCount);
  const manualQuote = sheet?.kind === "manual" ? (lineQuotes.find((quote) => quote.id === sheet.quoteId) ?? null) : null;
  const full = lineQuotes.length >= MAX_QUOTES_PER_LINE;

  return (
    <>
      <header className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{CATEGORY_TEXT[line.category]}</Badge>
              <LabelBadge label={line.label} />
            </p>
            <h1 className="wrap-anywhere font-bold text-2xl sm:text-3xl">Compare quotes for {line.name}</h1>
            <p className="text-muted-foreground">
              Line budget <strong className="text-foreground tabular-nums">{formatMoneyWhole(line.amount, plan.currency, locale)}</strong>
              {guests !== null && ` · ${guests.toLocaleString(locale)} guests`}
              {` · ${lineQuotes.length} of ${MAX_QUOTES_PER_LINE} quotes`}
            </p>
          </div>
          <Button onClick={() => setSheet({ kind: "add" })} disabled={full} title={full ? "Delete a quote to add another." : undefined}>
            <Plus aria-hidden="true" />
            Add a quote
          </Button>
        </div>
        {comparable.length > 0 && <Benchmark line={line} views={comparable} titles={titles} plan={plan} locale={locale} />}
      </header>

      <div aria-live="polite" className="flex flex-col gap-2">
        {message && (
          <Alert variant="info">
            <CircleCheck aria-hidden="true" />
            <AlertDescription className="text-foreground">{message}</AlertDescription>
          </Alert>
        )}
        {editor.notice && (
          <Alert variant={editor.notice.kind === "refused" ? "warning" : "error"}>
            <AlertTitle>{editor.notice.kind === "conflict" ? "Someone else changed this event" : "That change wasn't made"}</AlertTitle>
            <AlertDescription>{editor.notice.message}</AlertDescription>
          </Alert>
        )}
        {quotesError && (
          <Alert variant="error">
            <AlertTitle>Quotes couldn&apos;t be loaded</AlertTitle>
            <AlertDescription>Please reload the page.</AlertDescription>
          </Alert>
        )}
      </div>

      {quotes === null && !quotesError ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
          Loading quotes…
        </p>
      ) : lineQuotes.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center">
          <FileText aria-hidden="true" className="size-8 text-muted-foreground" />
          <h2 className="font-semibold text-lg">No quotes for this line yet</h2>
          <p className="max-w-prose text-muted-foreground">
            Paste a vendor&apos;s quote and PlanCraft reads it, adds up the line items, and flags hidden charges, unclear tax and other currencies.
          </p>
          <Button onClick={() => setSheet({ kind: "add" })}>
            <Plus aria-hidden="true" />
            Add a quote
          </Button>
        </section>
      ) : (
        <RadioGroup value={selected ?? ""} onValueChange={(value) => setSelected(String(value))} aria-label="Choose a quote for this line" className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lineQuotes.map((quote, i) => (
            <QuoteCard
              key={quote.id}
              quote={quote}
              view={views.get(quote.id) ?? null}
              index={i}
              plan={plan}
              line={line}
              locale={locale}
              reading={reading.get(quote.id) ?? null}
              selectable
              onRead={() => void read(quote)}
              onEdit={() => setSheet({ kind: "manual", quoteId: quote.id })}
              onDelete={() => remove(quote, titles.get(quote.id) ?? "this vendor")}
              onConvertedTotal={async (minor) => {
                try {
                  await repository.saveQuote(plan.id, { ...quote, convertedTotal: minor });
                } catch {
                  setMessage("The total couldn't be saved. Check your connection and try again.");
                }
              }}
            />
          ))}
        </RadioGroup>
      )}

      {readViews.length > 0 && <ComparisonTable views={readViews} titles={titles} plan={plan} locale={locale} />}
      <QuestionsPanel line={line} views={readViews} titles={titles} locale={locale} />

      {chosen && (
        // Figma "Floating action dock": the user links and confirms; nothing is booked (EM-36).
        <section aria-label="Selected quote" className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3 shadow-lg sm:p-4">
          <div className="min-w-0">
            <p className="wrap-anywhere font-semibold">Selected: {chosenTitle}</p>
            <p className="text-muted-foreground text-sm">
              {chosen.comparableTotal === null
                ? chosen.currencyMismatch
                  ? `Enter its total in ${plan.currency} to use it.`
                  : "This quote has no total to use."
                : `${formatMoneyWhole(chosen.comparableTotal, plan.currency, locale)} total`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {line.label === "confirmed" ? (
              <p className="max-w-sm text-sm">This line is confirmed. Un-confirm it on the plan to use another quote.</p>
            ) : line.quoteId === chosen.quote.id ? (
              <Button onClick={() => void confirmOnly()} loading={editor.busy}>
                <CircleCheck aria-hidden="true" />
                Confirm this price
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => void link(false)} disabled={chosen.comparableTotal === null || editor.busy}>
                  <Link2 aria-hidden="true" />
                  Link to line
                </Button>
                <Button onClick={() => void link(true)} disabled={chosen.comparableTotal === null || editor.busy}>
                  <CircleCheck aria-hidden="true" />
                  Link and confirm
                </Button>
              </>
            )}
          </div>
        </section>
      )}

      {sheet?.kind === "add" && <AddQuoteSheet line={line} open busy={adding} onOpenChange={() => setSheet(null)} onAdd={add} />}
      {manualQuote && (
        <ManualQuoteSheet
          key={manualQuote.id}
          details={views.get(manualQuote.id)?.details ?? null}
          line={line}
          plan={plan}
          locale={locale}
          open
          onOpenChange={() => setSheet(null)}
          onSave={(details) => saveManual(manualQuote, details)}
        />
      )}
    </>
  );
}
