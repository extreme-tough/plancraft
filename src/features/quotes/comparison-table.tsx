"use client";

import { fitScore } from "@/domain/fit-score";
import { formatMoneyWhole } from "@/domain/format";
import type { QuoteView } from "@/domain/quote-checks";
import type { BudgetLine, EventPlan } from "@/domain/schemas";
import { DifferenceText, TaxBadge, TotalCheckBadge } from "./quote-card";

const NOT_STATED = <span className="text-muted-foreground">Not stated</span>;

/**
 * EM-33 (Figma "Side-by-side matrix"): one column per quote, every value calculated by code from the
 * quote's line items. A missing value reads "Not stated", never 0. Scrolls sideways on small screens.
 */
export function ComparisonTable({
  views,
  titles,
  plan,
  line,
  best,
  locale,
}: {
  views: readonly QuoteView[];
  titles: ReadonlyMap<string, string>;
  plan: EventPlan;
  line: BudgetLine;
  best: string | null;
  locale: string;
}): React.ReactElement {
  const money = (view: QuoteView, minor: number | null): React.ReactNode =>
    minor === null ? NOT_STATED : <span className="tabular-nums">{formatMoneyWhole(minor, view.details.currency, locale)}</span>;
  const list = (items: readonly string[]): React.ReactNode =>
    items.length === 0 ? (
      NOT_STATED
    ) : (
      <ul className="flex flex-col gap-0.5">
        {items.map((item, i) => (
          <li key={i} className="wrap-anywhere">
            {item}
          </li>
        ))}
      </ul>
    );

  const rows: ReadonlyArray<{ heading: string; cell: (view: QuoteView) => React.ReactNode }> = [
    {
      heading: "Total",
      cell: (view) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">
            {money(view, view.total)}
            {view.exclTax && " excl. tax"}
          </span>
          {view.difference !== null ? (
            <span className="text-xs">
              <DifferenceText difference={view.difference} currency={plan.currency} locale={locale} />
            </span>
          ) : (
            view.currencyMismatch && <span className="text-xs">Not compared: enter the total in {plan.currency}</span>
          )}
        </div>
      ),
    },
    { heading: "Per guest", cell: (view) => (view.perGuest === null ? NOT_STATED : formatMoneyWhole(view.perGuest, plan.currency, locale)) },
    { heading: "Base price", cell: (view) => money(view, view.base) },
    { heading: "Taxes and fees", cell: (view) => money(view, view.taxesAndFees) },
    { heading: "Total check", cell: (view) => <TotalCheckBadge check={view.totalCheck} currency={view.details.currency} locale={locale} /> },
    { heading: "Tax", cell: (view) => <TaxBadge view={view} /> },
    {
      heading: "Guests covered",
      cell: (view) =>
        view.details.guestsCovered === null
          ? NOT_STATED
          : `${view.details.guestsCovered.toLocaleString(locale)}${view.guestsShort !== null ? ` (${view.guestsShort.toLocaleString(locale)} short)` : ""}`,
    },
    {
      heading: "Your needs",
      cell: (view) => (view.details.needsCoverage.length === 0 ? NOT_STATED : `${view.needsCovered} of ${view.details.needsCoverage.length} covered`),
    },
    { heading: "Included", cell: (view) => list(view.details.inclusions) },
    { heading: "Excluded or assumed", cell: (view) => list(view.details.exclusions) },
    {
      // EM-68
      heading: "Fit score",
      cell: (view) => `${fitScore(view, line.amount).total} of 100${best === view.quote.id ? " (best fit by our checks)" : ""}`,
    },
    { heading: "Items to clarify", cell: (view) => (view.questions.length === 0 ? "None" : `${view.questions.length}`) },
  ];

  return (
    <section aria-labelledby="matrix-heading" className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card sm:p-6">
      <div>
        <h2 id="matrix-heading" className="font-bold text-xl">
          Side by side
        </h2>
        <p className="text-muted-foreground text-sm">Every figure is worked out from the quote&apos;s own line items.</p>
      </div>
      {/* Focusable so keyboard users can scroll it sideways on a phone. */}
      <div className="overflow-x-auto rounded-xl border" tabIndex={0} role="region" aria-labelledby="matrix-heading">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <caption className="sr-only">Quotes compared on price, tax, guests and scope</caption>
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="p-3 text-start font-semibold">
                Quote
              </th>
              {views.map((view) => (
                <th key={view.quote.id} scope="col" className="wrap-anywhere p-3 text-start font-semibold">
                  {titles.get(view.quote.id)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.heading} className="border-t align-top">
                <th scope="row" className="p-3 text-start font-medium">
                  {row.heading}
                </th>
                {views.map((view) => (
                  <td key={view.quote.id} className="p-3">
                    {row.cell(view)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
