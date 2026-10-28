"use client";

import { CircleAlert, CircleCheck, FileText, Pencil, Plus, Scale, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { summarizeBudget } from "@/domain/budget";
import { formatMoneyCompact, formatMoneyWhole } from "@/domain/format";
import { lineGuests } from "@/domain/guests";
import { isUnderFunded, lineEstimateTotal } from "@/domain/plan-build";
import { CATEGORIES, type BudgetLine, type CostLabel, type EventPlan } from "@/domain/schemas";
import { CATEGORY_TEXT } from "@/lib/display-names";

/** EM-19, EM-41: every label as text plus an icon, never colour alone (UX-11). */
export function LabelBadge({ label }: { label: CostLabel }): React.ReactElement {
  if (label === "confirmed") {
    return (
      <Badge variant="success" className="text-success-foreground">
        <CircleCheck aria-hidden="true" />
        Confirmed
      </Badge>
    );
  }
  if (label === "vendor_quoted") {
    return (
      <Badge variant="warning" className="text-warning-foreground">
        <FileText aria-hidden="true" />
        Vendor Quoted (Unverified)
      </Badge>
    );
  }
  return (
    <Badge variant="info" className="text-info-foreground">
      <Sparkles aria-hidden="true" />
      AI Estimate
    </Badge>
  );
}

type Filter = "all" | CostLabel;

const FILTERS: ReadonlyArray<{ value: Filter; text: string }> = [
  { value: "all", text: "All" },
  { value: "confirmed", text: "Confirmed" },
  { value: "vendor_quoted", text: "Quoted" },
  { value: "ai_estimate", text: "AI Estimate" },
];

function LineRow({
  line,
  plan,
  locale,
  share,
  onEdit,
}: {
  line: BudgetLine;
  plan: EventPlan;
  locale: string;
  share: number;
  onEdit: () => void;
}): React.ReactElement {
  const whole = (minor: number): string => formatMoneyWhole(minor, plan.currency, locale);
  const estimate = lineEstimateTotal(line, plan.guestCount);
  const guests = lineGuests(line, plan.guestCount);
  const part = line.partId ? plan.parts.find((p) => p.id === line.partId) : undefined;
  const details = [...line.assumptions.map((text) => ({ kind: "Assumption", text })), ...line.vendorNeeds.map((text) => ({ kind: "Ask for", text })), ...line.vendorQuestions.map((text) => ({ kind: "Question", text }))];

  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h4 className="wrap-anywhere font-semibold">{line.name}</h4>
          <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-sm">
            <LabelBadge label={line.label} />
            {guests !== null && <Badge variant="outline">× {guests.toLocaleString(locale)} guests</Badge>}
            {part && <Badge variant="outline">{part.name}</Badge>}
            {isUnderFunded(line, plan.guestCount) && (
              <Badge variant="warning" className="text-warning-foreground">
                <CircleAlert aria-hidden="true" />
                Under-funded
              </Badge>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-1">
          <div className="flex flex-col items-end">
            <span className="font-bold tabular-nums">{whole(line.amount)}</span>
            <span className="text-muted-foreground text-xs">
              {line.pricing === "per_guest" && line.unitCost !== null
                ? `${formatMoneyCompact(line.unitCost, plan.currency, locale)} per guest`
                : `${share.toLocaleString(locale, { maximumFractionDigits: 1 })}% of budget`}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${line.name}`}>
            <Pencil aria-hidden="true" />
          </Button>
        </div>
      </div>
      <Link
        href={`/events/${plan.id}/quotes?line=${encodeURIComponent(line.id)}`}
        className="inline-flex items-center gap-1.5 self-start rounded-sm text-accent-foreground text-sm underline-offset-4 hover:underline"
        aria-label={`Compare quotes for ${line.name}`}
      >
        <Scale aria-hidden="true" className="size-4" />
        Compare quotes
      </Link>
      {(estimate || details.length > 0) && (
        // UX-09: the line's own assumptions, expandable.
        <details className="group text-sm">
          <summary className="cursor-pointer rounded-sm text-accent-foreground">Assumptions and vendor questions</summary>
          <div className="mt-2 flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
            {estimate && (
              <p>
                Typical range: {whole(estimate.low)} to {whole(estimate.high)}
              </p>
            )}
            {details.length > 0 && (
              <ul className="flex flex-col gap-1">
                {details.map((item, i) => (
                  <li key={i}>
                    <span className="font-medium">{item.kind}:</span> <span className="text-muted-foreground">{item.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}
    </li>
  );
}

/**
 * Budget lines grouped by category (Figma "Budget Lines"), with a label filter, subtotals and
 * shares calculated on read (EM-16, EM-44). Editing opens the line sheet.
 */
export function BudgetLines({
  plan,
  locale,
  onEdit,
  onAdd,
  disabled,
}: {
  plan: EventPlan;
  locale: string;
  onEdit: (lineId: string) => void;
  onAdd: () => void;
  disabled: boolean;
}): React.ReactElement {
  const [filter, setFilter] = useState<Filter>("all");
  const budget = summarizeBudget(plan);
  const shown = plan.lines.filter((line) => filter === "all" || line.label === filter);
  const groups = CATEGORIES.map((category) => ({ category, lines: shown.filter((line) => line.category === category) })).filter((g) => g.lines.length > 0);
  const usedCategories = new Set(plan.lines.map((line) => line.category)).size;

  return (
    <section aria-labelledby="budget-lines-heading" className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="budget-lines-heading" className="flex flex-wrap items-center gap-2 font-bold text-xl">
            Budget lines
            <Badge variant="outline">
              {usedCategories} {usedCategories === 1 ? "category" : "categories"} · {plan.lines.length} {plan.lines.length === 1 ? "line" : "lines"}
            </Badge>
          </h2>
          <p className="text-muted-foreground text-sm">Estimates, quotes and confirmed costs.</p>
        </div>
        {plan.lines.length > 0 && (
          <RadioGroup
            value={filter}
            onValueChange={(next) => setFilter(next as Filter)}
            aria-label="Show lines"
            className="flex flex-row flex-wrap gap-1 rounded-full border bg-muted/60 p-1"
          >
            {FILTERS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-sm has-data-checked:bg-card has-data-checked:font-semibold has-data-checked:shadow-card has-focus-visible:ring-2 has-focus-visible:ring-ring"
              >
                <Radio value={option.value} className="sr-only" />
                {option.text}
              </label>
            ))}
          </RadioGroup>
        )}
      </div>

      {plan.lines.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed p-4">
          <p className="font-medium">No lines yet: nothing has been estimated for you.</p>
          <ul className="flex flex-wrap gap-2" aria-label="Categories">
            {CATEGORIES.map((category) => (
              <li key={category}>
                <Badge variant="outline" size="lg">
                  {CATEGORY_TEXT[category]}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground">No lines with this label.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(({ category, lines }) => (
            <section key={category} aria-labelledby={`group-${category}`} className="flex flex-col gap-3 rounded-xl bg-muted/50 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
                <h3 id={`group-${category}`} className="font-semibold">
                  {CATEGORY_TEXT[category]}
                </h3>
                <span className="text-sm">
                  Subtotal: <strong className="tabular-nums">{formatMoneyWhole(lines.reduce((sum, line) => sum + line.amount, 0), plan.currency, locale)}</strong>
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {lines.map((line) => (
                  <LineRow
                    key={line.id}
                    line={line}
                    plan={plan}
                    locale={locale}
                    share={(budget.percentTenths.get(line.id) ?? 0) / 10}
                    onEdit={() => onEdit(line.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Button variant="outline" className="border-dashed" onClick={onAdd} disabled={disabled}>
        <Plus aria-hidden="true" />
        Add a budget line
      </Button>
    </section>
  );
}
