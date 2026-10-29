"use client";

import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleMinus,
  Coins,
  Pencil,
  RotateCw,
  Sparkles,
  ShieldAlert,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radio } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { amountErrorMessage, parseAmount } from "@/domain/amount-parser";
import { Textarea } from "@/components/ui/textarea";
import { FIT_MAX, fitScore, type FitScore } from "@/domain/fit-score";
import { formatDate, formatMoneyCompact, formatMoneyWhole } from "@/domain/format";
import { minorToMajor } from "@/domain/money";
import type { Quote } from "@/domain/quote";
import type { QuoteView, TotalCheck } from "@/domain/quote-checks";
import type { BudgetLine, EventPlan } from "@/domain/schemas";
import { LabelBadge } from "@/features/dashboard/budget-lines";
import { AmountField } from "@/features/event-create/amount-field";
import { FormField } from "@/features/event-create/form-field";
import type { AiError } from "@/lib/ai-client";

export type Reading = { state: "working" } | { state: "error"; error: AiError };

/** "Saffron Table Caterers", or a stand-in when the quote names nobody. */
export function vendorTitle(view: QuoteView | null, index: number): string {
  return view?.details.vendorName?.trim() || `Quote ${index + 1}`;
}

/** EM-49 as text and an icon. */
export function TotalCheckBadge({ check, currency, locale }: { check: TotalCheck; currency: string; locale: string }): React.ReactElement {
  switch (check.kind) {
    case "adds_up":
      return (
        <Badge variant="success" className="text-success-foreground">
          <CircleCheck aria-hidden="true" />
          Adds up
        </Badge>
      );
    case "rounding":
      return (
        <Badge variant="outline">
          <CircleCheck aria-hidden="true" />
          Rounding difference
        </Badge>
      );
    case "gap":
      return (
        // Long enough to wrap at 360 px: drop the badge's fixed height so the background grows with the text.
        <Badge variant="error" className="h-auto justify-start whitespace-normal py-0.5 text-start text-destructive-foreground sm:h-auto">
          <CircleAlert aria-hidden="true" />
          Gap of {formatMoneyWhole(Math.abs(check.difference), currency, locale)}: possible hidden or missing charge
        </Badge>
      );
    case "no_stated_total":
      return (
        <Badge variant="warning" className="text-warning-foreground">
          <CircleHelp aria-hidden="true" />
          Quote states no total
        </Badge>
      );
    case "no_items":
    case "no_total":
      return (
        <Badge variant="warning" className="text-warning-foreground">
          <CircleHelp aria-hidden="true" />
          Can&apos;t check the total
        </Badge>
      );
  }
}

/** EM-51. */
export function TaxBadge({ view }: { view: QuoteView }): React.ReactElement {
  if (view.details.taxTreatment === "unclear") {
    return (
      <Badge variant="warning" className="text-warning-foreground">
        <CircleHelp aria-hidden="true" />
        Tax unclear
      </Badge>
    );
  }
  if (view.exclTax) {
    return (
      <Badge variant="warning" className="text-warning-foreground">
        <CircleAlert aria-hidden="true" />
        Tax extra, not shown
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <CircleCheck aria-hidden="true" />
      {view.details.taxTreatment === "included" ? "Tax included" : "Tax listed separately"}
    </Badge>
  );
}

/** EM-32: "₹15,000 under the line" in text, never colour alone. */
export function DifferenceText({ difference, currency, locale }: { difference: number; currency: string; locale: string }): React.ReactElement {
  const amount = formatMoneyWhole(Math.abs(difference), currency, locale);
  if (difference === 0) return <span>Matches the line</span>;
  return difference > 0 ? (
    <span className="text-destructive-foreground">{amount} over the line</span>
  ) : (
    <span className="text-success-foreground">{amount} under the line</span>
  );
}

function ConvertedTotal({
  quote,
  view,
  plan,
  locale,
  onSave,
}: {
  quote: Quote;
  view: QuoteView;
  plan: EventPlan;
  locale: string;
  onSave: (minor: number) => Promise<void>;
}): React.ReactElement {
  const [text, setText] = useState(quote.convertedTotal === null ? "" : String(minorToMajor(quote.convertedTotal, plan.currency)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = `converted-${quote.id}`;

  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const parsed = parseAmount(text, plan.currency, locale);
    if (parsed.kind === "error") return setError(amountErrorMessage(parsed, plan.currency));
    if (parsed.minor <= 0) return setError("Enter a total above zero.");
    setError(null);
    setBusy(true);
    await onSave(parsed.minor).finally(() => setBusy(false));
  };

  return (
    <Alert variant="warning">
      <Coins aria-hidden="true" />
      <AlertTitle>Quoted in {view.details.currency}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>
          PlanCraft never converts currencies. Enter what this quote costs in {plan.currency}, for example from your bank&apos;s rate, to compare it.
        </p>
        <form onSubmit={(e) => void save(e)} className="flex flex-col gap-2" noValidate>
          <FormField id={id} label={`Total in ${plan.currency}`} error={error}>
            {(aria) => <AmountField aria={aria} value={text} currency={plan.currency} locale={locale} suggestions={[]} onChange={setText} />}
          </FormField>
          <Button type="submit" variant="outline" size="sm" className="self-start" loading={busy}>
            Save total
          </Button>
        </form>
      </AlertDescription>
    </Alert>
  );
}

const DEDUCTION_TEXT: Record<FitScore["deductions"][number], string> = {
  total_gap: "the total has a gap (−8)",
  no_total: "the total can't be checked (−8)",
  tax: "tax is unclear or extra (−6)",
  unverified: "some values don't add up or aren't in the quote text (−6)",
};

/**
 * EM-68: the fit score and its parts, all calculated by code. It only ranks the quotes: the user
 * still links and confirms (EM-35).
 */
function FitScoreBlock({ fit, best }: { fit: FitScore; best: boolean }): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        {best && (
          <Badge variant="success" className="text-success-foreground">
            <Sparkles aria-hidden="true" />
            Best fit by our checks
          </Badge>
        )}
        <span className="font-semibold">Fit score: {fit.total} of 100</span>
      </p>
      <details>
        <summary className="cursor-pointer rounded-sm text-accent-foreground">How the score is worked out</summary>
        <ul className="mt-2 flex flex-col gap-1 rounded-lg bg-muted/60 p-3">
          <li>
            Budget fit: {fit.budget} of {FIT_MAX.budget}
            {fit.notCompared && " (not compared yet)"}
          </li>
          <li>
            Your needs covered: {fit.needs} of {FIT_MAX.needs}
          </li>
          <li>
            Clear pricing: {fit.clarity} of {FIT_MAX.clarity}
            {fit.deductions.length > 0 && `: ${fit.deductions.map((d) => DEDUCTION_TEXT[d]).join("; ")}`}
          </li>
        </ul>
        <p className="mt-2 text-muted-foreground text-xs">Worked out from the checks on this card. It doesn&apos;t vouch for the vendor.</p>
      </details>
    </div>
  );
}

/** EM-66: a plain-text team note on the quote, saved when the box loses focus. */
function QuoteNote({ quote, onSave }: { quote: Quote; onSave: (note: string) => Promise<boolean> }): React.ReactElement {
  const [text, setText] = useState(quote.note);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const id = `note-${quote.id}`;
  const save = async (): Promise<void> => {
    if (text.trim() === quote.note) return;
    setState("saving");
    setState((await onSave(text)) ? "saved" : "failed");
  };
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={id} className="font-medium">
        Team note
      </label>
      <Textarea id={id} value={text} maxLength={1000} rows={2} aria-describedby={`${id}-state`} onChange={(e) => setText(e.target.value)} onBlur={() => void save()} />
      <p id={`${id}-state`} aria-live="polite" className="text-muted-foreground text-xs">
        {state === "saving" ? "Saving…" : state === "failed" ? "Not saved. Check your connection and try again." : state === "saved" ? "Note saved" : "Saved when you leave the box."}
      </p>
    </div>
  );
}

/**
 * One quote (Figma "Quote summary card"): what the vendor wrote, and every check code ran on it.
 * Vendor names come only from the user's quote (EM-34), and every quote stays unverified until the
 * user confirms it with the vendor (EM-35).
 */
export function QuoteCard({
  quote,
  view,
  index,
  plan,
  line,
  locale,
  reading,
  selectable,
  best,
  onRead,
  onEdit,
  onDelete,
  onConvertedTotal,
  onNote,
}: {
  quote: Quote;
  view: QuoteView | null;
  index: number;
  plan: EventPlan;
  line: BudgetLine;
  locale: string;
  reading: Reading | null;
  selectable: boolean;
  /** EM-68: this quote has the single highest fit score among those compared. */
  best: boolean;
  onRead: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onConvertedTotal: (minor: number) => Promise<void>;
  onNote: (note: string) => Promise<boolean>;
}): React.ReactElement {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const title = vendorTitle(view, index);
  const headingId = `quote-${quote.id}-title`;
  const linked = line.quoteId === quote.id;
  const money = (minor: number): string => formatMoneyWhole(minor, view?.details.currency ?? plan.currency, locale);

  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-card has-data-checked:border-primary has-data-checked:ring-2 has-data-checked:ring-primary/30 sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent font-bold text-accent-foreground">
            {title.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h3 id={headingId} className="wrap-anywhere font-semibold text-lg leading-tight">
              {title}
            </h3>
            <p className="text-muted-foreground text-xs">{view?.details.vendorName ? "From your quote: unverified" : "No vendor name in the quote"}</p>
          </div>
        </div>
        {linked && <LabelBadge label={line.label} />}
      </header>

      <div aria-live="polite">
        {reading?.state === "working" && (
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
            Reading the quote…
          </p>
        )}
        {reading?.state === "error" && (
          <Alert variant="error">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>The quote couldn&apos;t be read</AlertTitle>
            <AlertDescription>{reading.error.message} Its text is saved.</AlertDescription>
          </Alert>
        )}
      </div>

      {!view ? (
        reading?.state !== "working" && (
          <div className="flex flex-col gap-3 rounded-xl border border-dashed p-3">
            {!reading && <p className="text-sm">Not read yet. Its text is saved.</p>}
            <div className="flex flex-wrap gap-2">
              {(!reading || reading.error.retryable) && (
                <Button size="sm" onClick={onRead}>
                  <RotateCw aria-hidden="true" />
                  {reading ? "Retry" : "Read the quote"}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Pencil aria-hidden="true" />
                Enter details manually
              </Button>
            </div>
          </div>
        )
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-bold text-3xl tabular-nums">{view.total === null ? "Not stated" : money(view.total)}</span>
              {view.exclTax && <span className="font-medium text-sm">excl. tax</span>}
            </p>
            {view.difference !== null && (
              <p className="font-medium text-sm">
                <DifferenceText difference={view.difference} currency={plan.currency} locale={locale} />
                {view.currencyMismatch && view.comparableTotal !== null && ` (your total: ${formatMoneyWhole(view.comparableTotal, plan.currency, locale)})`}
              </p>
            )}
            <p className="text-muted-foreground text-sm">
              Base: {view.base === null ? "Not stated" : money(view.base)} · Taxes and fees: {view.taxesAndFees === null ? "Not stated" : money(view.taxesAndFees)}
              {view.perGuest !== null && ` · ${formatMoneyWhole(view.perGuest, plan.currency, locale)} per guest`}
            </p>
          </div>

          <FitScoreBlock fit={fitScore(view, line.amount)} best={best} />

          {view.currencyMismatch && <ConvertedTotal key={quote.convertedTotal ?? "none"} quote={quote} view={view} plan={plan} locale={locale} onSave={onConvertedTotal} />}

          <ul className="flex flex-wrap gap-1.5" aria-label="Checks">
            <li>
              <TotalCheckBadge check={view.totalCheck} currency={view.details.currency} locale={locale} />
            </li>
            <li>
              <TaxBadge view={view} />
            </li>
            <li>
              {view.details.guestsCovered === null ? (
                <Badge variant="outline">
                  <Users aria-hidden="true" />
                  Guests: not stated
                </Badge>
              ) : view.guestsShort !== null ? (
                <Badge variant="warning" className="text-warning-foreground">
                  <Users aria-hidden="true" />
                  Covers {view.details.guestsCovered.toLocaleString(locale)} of {view.lineGuests?.toLocaleString(locale)} guests
                </Badge>
              ) : (
                <Badge variant="outline">
                  <Users aria-hidden="true" />
                  {view.details.guestsCovered.toLocaleString(locale)} guests
                </Badge>
              )}
            </li>
            {view.validUntil && (
              <li>
                <Badge variant="outline">Valid until {formatDate(view.validUntil, locale)}</Badge>
              </li>
            )}
            {view.validUntilFlag && (
              <li>
                <Badge variant="warning" className="text-warning-foreground">
                  <CircleHelp aria-hidden="true" />
                  Check: validity date unclear
                </Badge>
              </li>
            )}
            {view.manual && (
              <li>
                <Badge variant="outline">
                  <Pencil aria-hidden="true" />
                  Entered by you
                </Badge>
              </li>
            )}
          </ul>

          {view.details.needsCoverage.length > 0 && (
            <div className="flex flex-col gap-1.5 text-sm">
              <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                Your needs: {view.needsCovered} of {view.details.needsCoverage.length} covered
              </h4>
              <ul className="flex flex-col gap-1">
                {view.details.needsCoverage.map(({ need, status }) => (
                  <li key={need} className="flex items-start gap-2">
                    {status === "covered" ? (
                      <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-foreground" />
                    ) : status === "not_covered" ? (
                      <CircleMinus aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive-foreground" />
                    ) : (
                      <CircleHelp aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
                    )}
                    <span>
                      {need}: <span className="font-medium">{status === "covered" ? "covered" : status === "not_covered" ? "not covered" : "not mentioned"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {[
            { heading: "Included", items: view.details.inclusions, icon: CircleCheck },
            { heading: "Excluded or left to you", items: view.details.exclusions, icon: CircleMinus },
          ].map(
            ({ heading, items, icon: Icon }) =>
              items.length > 0 && (
                <div key={heading} className="flex flex-col gap-1.5 text-sm">
                  <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">{heading}</h4>
                  <ul className="flex flex-col gap-1">
                    {items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="wrap-anywhere">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
          )}

          {view.details.items.length > 0 && (
            <details className="text-sm" open={view.arithmeticFlags.size > 0 || view.ungroundedItems.size > 0 || view.ungroundedTotal}>
              <summary className="cursor-pointer rounded-sm text-accent-foreground">Line items ({view.details.items.length})</summary>
              <ul className="mt-2 flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
                {view.details.items.map((item, i) => (
                  <li key={i} className="flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-3">
                      <span className="wrap-anywhere">
                        {item.description}
                        {item.quantity !== null && item.unitPrice !== null && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({item.quantity.toLocaleString(locale)} × {formatMoneyCompact(item.unitPrice, view.details.currency, locale)})
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatMoneyCompact(item.amount, view.details.currency, locale)}</span>
                    </div>
                    {view.arithmeticFlags.has(i) && (
                      <span className="flex items-center gap-1 text-warning-foreground text-xs">
                        <CircleAlert aria-hidden="true" className="size-3.5" />
                        Check the arithmetic
                      </span>
                    )}
                    {view.ungroundedItems.has(i) && (
                      <span className="flex items-center gap-1 text-warning-foreground text-xs">
                        <CircleHelp aria-hidden="true" className="size-3.5" />
                        Check: not found in the quote text
                      </span>
                    )}
                  </li>
                ))}
                {view.details.statedTotal !== null && (
                  <li className="flex flex-col gap-1 border-t pt-2 font-medium">
                    <div className="flex justify-between gap-3">
                      <span>Stated total</span>
                      <span className="tabular-nums">{formatMoneyCompact(view.details.statedTotal, view.details.currency, locale)}</span>
                    </div>
                    {view.ungroundedTotal && (
                      <span className="flex items-center gap-1 font-normal text-warning-foreground text-xs">
                        <CircleHelp aria-hidden="true" className="size-3.5" />
                        Check: not found in the quote text
                      </span>
                    )}
                  </li>
                )}
              </ul>
            </details>
          )}
        </>
      )}

      <QuoteNote quote={quote} onSave={onNote} />

      <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <ShieldAlert aria-hidden="true" className="size-3.5 shrink-0" />
        Unverified until you confirm with the vendor
      </p>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        {selectable && view ? (
          <label className="flex cursor-pointer items-center gap-2 font-medium text-sm">
            <Radio value={quote.id} />
            Select {title}
          </label>
        ) : (
          <span />
        )}
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Delete ${title}?`}>
            <span className="text-sm">Delete this quote?</span>
            <Button
              size="sm"
              variant="destructive"
              loading={deleting}
              onClick={() => {
                setDeleting(true);
                void onDelete().finally(() => setDeleting(false));
              }}
            >
              Delete
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-1">
            {view && (
              <Button size="sm" variant="ghost" onClick={onEdit}>
                <Pencil aria-hidden="true" />
                Edit details
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-destructive-foreground" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${title}`}>
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          </div>
        )}
      </footer>
    </article>
  );
}
