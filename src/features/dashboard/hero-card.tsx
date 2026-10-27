"use client";

import { CalendarDays, CircleAlert, MapPin, Users, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { summarizeBudget } from "@/domain/budget";
import { planningWindowDays } from "@/domain/event-input";
import { formatDate, formatMoneyWhole } from "@/domain/format";
import type { EventPlan } from "@/domain/schemas";
import { countryName, EVENT_TYPE_TEXT, USE_CASE_TEXT } from "@/lib/display-names";

function windowText(days: number): string {
  if (days > 1) return `${days} days to plan`;
  if (days === 1) return "1 day to plan";
  if (days === 0) return "Today";
  return "This date has passed";
}

function Chip({ icon: Icon, children }: { icon: typeof CalendarDays; children: ReactNode }): React.ReactElement {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1 text-sm">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-accent-foreground" />
      <span className="wrap-anywhere">{children}</span>
    </li>
  );
}

/**
 * The event at a glance (Figma "Plan Dashboard" hero): name and type, date with the planning window
 * (EM-01), place, guests and parts, and the budget meter. Every number is calculated on read and
 * written out as text, never shown by colour or bar length alone (UX-11).
 */
export function HeroCard({
  plan,
  today,
  locale,
  status,
}: {
  plan: EventPlan;
  today: string;
  locale: string;
  status?: ReactNode;
}): React.ReactElement {
  const money = (minor: number): string => formatMoneyWhole(minor, plan.currency, locale);
  const budget = summarizeBudget(plan);
  const pct = (part: number): number => (plan.budget > 0 ? Math.min(100, (part / plan.budget) * 100) : 0);
  const allocatedPct = plan.budget > 0 ? Math.round((budget.allocated / plan.budget) * 100) : 0;
  const showStyle = USE_CASE_TEXT[plan.useCase].title !== EVENT_TYPE_TEXT[plan.eventType];
  const guests = [
    `${plan.guestCount.toLocaleString(locale)} guests`,
    ...plan.parts.map((part) => `${part.name}: ${part.guestCount.toLocaleString(locale)}`),
  ].join(" · ");

  return (
    <section aria-labelledby="event-title" className="flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 id="event-title" className="wrap-anywhere font-bold text-2xl sm:text-3xl">
              {plan.occasion}
            </h1>
            <Badge size="lg" className="uppercase tracking-wide">
              {EVENT_TYPE_TEXT[plan.eventType]}
            </Badge>
            {/* "Wedding · Wedding" says nothing; the plan style shows only when it adds something. */}
            {showStyle && (
              <Badge variant="outline" size="lg">
                Plan style: {USE_CASE_TEXT[plan.useCase].title}
              </Badge>
            )}
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Event details">
            <Chip icon={CalendarDays}>
              {formatDate(plan.eventDate, locale)} · {windowText(planningWindowDays(plan.eventDate, today))}
            </Chip>
            <Chip icon={MapPin}>
              {plan.location.city}, {countryName(plan.location.country)}
            </Chip>
            <Chip icon={Users}>{guests}</Chip>
          </ul>
        </div>
        {status}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-muted/60 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-bold text-2xl tabular-nums">{money(budget.allocated)}</span>
            <span className="text-muted-foreground text-sm">
              allocated of {money(plan.budget)} budget ({plan.currency})
            </span>
            <Badge variant="outline">{allocatedPct}% allocated</Badge>
          </p>
          {budget.remaining >= 0 ? (
            <p className="text-sm">
              Remaining: <strong className="font-semibold text-info-foreground">{money(budget.remaining)}</strong>
            </p>
          ) : (
            // EM-44: a shortfall is shown with text and an icon, not colour alone.
            <p className="flex items-center gap-1.5 font-semibold text-destructive-foreground text-sm">
              <CircleAlert aria-hidden="true" className="size-4" />
              Over budget by {money(budget.shortfall)}
            </p>
          )}
        </div>
        <div aria-hidden="true" className="flex h-2.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-primary-hover" style={{ width: `${pct(budget.confirmed)}%` }} />
          <div className="h-full bg-primary/70" style={{ width: `${Math.max(0, pct(budget.allocated) - pct(budget.confirmed))}%` }} />
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-muted-foreground text-sm">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-primary-hover" />
            Confirmed: {money(budget.confirmed)}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-primary/70" />
            Still estimated or quoted: {money(budget.allocated - budget.confirmed)}
          </li>
          <li className="flex items-center gap-1.5">
            <Wallet aria-hidden="true" className="size-3.5" />
            Budget: {money(plan.budget)}
          </li>
        </ul>
        {budget.confirmedOverrun > 0 && (
          <p className="flex items-center gap-1.5 font-semibold text-destructive-foreground text-sm">
            <CircleAlert aria-hidden="true" className="size-4" />
            {/* EM-42: stated, never fixed automatically. */}
            Confirmed costs alone exceed the budget by {money(budget.confirmedOverrun)}. Nothing has been changed.
          </p>
        )}
      </div>
    </section>
  );
}
