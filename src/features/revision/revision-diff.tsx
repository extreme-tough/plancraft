"use client";

import { ArrowRight, CalendarClock, CircleAlert, CircleMinus, CirclePlus, Lock, TriangleAlert, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BudgetSummary } from "@/domain/budget";
import type { LineDiff, PlanDiff, TaskDiff } from "@/domain/diff";
import { formatDate, formatMoneyWhole } from "@/domain/format";
import type { EventPlan } from "@/domain/schemas";

const STATUS_TEXT = { done: "Done", on_track: "On track", tight: "Tight", overdue: "Overdue" } as const;

function Bar({ summary, scale, label }: { summary: BudgetSummary; scale: number; label: string }): React.ReactElement {
  const pct = (minor: number): number => (scale > 0 ? Math.min(100, (minor / scale) * 100) : 0);
  return (
    <div className="flex flex-col gap-1.5" aria-hidden="true">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="relative h-3 overflow-hidden rounded-full bg-secondary">
        <div className="absolute inset-y-0 start-0 bg-primary/80" style={{ width: `${pct(summary.allocated)}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ insetInlineStart: `${pct(summary.budget)}%` }} />
      </div>
    </div>
  );
}

/** EM-52 (b): budget, total and remaining or shortfall, before and after. Bars plus text and a table. */
export function BudgetImpact({ diff, plan, locale }: { diff: PlanDiff; plan: EventPlan; locale: string }): React.ReactElement {
  const money = (minor: number): string => formatMoneyWhole(minor, plan.currency, locale);
  const { before, after } = diff.budget;
  const scale = Math.max(before.allocated, before.budget, after.allocated, after.budget);
  const balance = (s: BudgetSummary): string => (s.remaining >= 0 ? `${money(s.remaining)} remaining` : `${money(s.shortfall)} short`);

  return (
    <section aria-labelledby="budget-impact-heading" className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card">
      <h2 id="budget-impact-heading" className="font-bold text-lg">
        Budget
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">Before</p>
          <p className="font-semibold">
            {money(before.allocated)} of {money(before.budget)}
          </p>
          <p className="text-sm">{balance(before)}</p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">After</p>
          <p className="font-semibold">
            {money(after.allocated)} of {money(after.budget)}
          </p>
          {after.remaining >= 0 ? (
            <p className="text-sm">{balance(after)}</p>
          ) : (
            <p className="flex items-center gap-1.5 font-semibold text-destructive-foreground text-sm">
              <CircleAlert aria-hidden="true" className="size-4" />
              Shortfall: {money(after.shortfall)}
            </p>
          )}
        </div>
      </div>
      <Bar summary={before} scale={scale} label="Before: allocated, with the budget marked" />
      <Bar summary={after} scale={scale} label="After: allocated, with the budget marked" />
      <table className="sr-only">
        <caption>Budget before and after</caption>
        <thead>
          <tr>
            <th scope="col">Figure</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Budget</th>
            <td>{money(before.budget)}</td>
            <td>{money(after.budget)}</td>
          </tr>
          <tr>
            <th scope="row">Allocated</th>
            <td>{money(before.allocated)}</td>
            <td>{money(after.allocated)}</td>
          </tr>
          <tr>
            <th scope="row">Remaining or shortfall</th>
            <td>{balance(before)}</td>
            <td>{balance(after)}</td>
          </tr>
        </tbody>
      </table>
      {after.confirmedOverrun > 0 && (
        <p className="flex items-center gap-1.5 font-semibold text-destructive-foreground text-sm">
          <CircleAlert aria-hidden="true" className="size-4" />
          Confirmed costs alone exceed the new budget by {money(after.confirmedOverrun)}, so no option can close the gap.
        </p>
      )}
    </section>
  );
}

function Flags({ line, locale, plan }: { line: LineDiff; locale: string; plan: EventPlan }): React.ReactElement {
  return (
    <span className="flex flex-wrap gap-1.5">
      {line.change === "added" && (
        <Badge variant="info" className="text-info-foreground">
          <CirclePlus aria-hidden="true" />
          New line
        </Badge>
      )}
      {line.change === "removed" && (
        <Badge variant="error" className="text-destructive-foreground">
          <CircleMinus aria-hidden="true" />
          Removed
        </Badge>
      )}
      {line.flags.includes("locked") && (
        <Badge variant="success" className="text-success-foreground">
          <Lock aria-hidden="true" />
          Confirmed: protected
        </Badge>
      )}
      {line.flags.includes("reconfirm_new_date") && (
        <Badge variant="warning" className="text-warning-foreground">
          <CalendarClock aria-hidden="true" />
          Reconfirm for new date
        </Badge>
      )}
      {line.flags.includes("confirmed_for_other_guest_count") && (
        <Badge variant="warning" className="text-warning-foreground">
          <Users aria-hidden="true" />
          Confirmed for {line.confirmedFor?.toLocaleString(locale)} guests
        </Badge>
      )}
      {line.flags.includes("own_guest_count_unchanged") && (
        <Badge variant="outline">
          <Users aria-hidden="true" />
          Own guest count: unchanged ({line.after?.ownGuests?.toLocaleString(locale) ?? plan.guestCount})
        </Badge>
      )}
    </span>
  );
}

/** EM-52 (a) and (e): changed or flagged lines old → new, and what deliberately didn't change. */
export function LineImpact({ diff, plan, locale }: { diff: PlanDiff; plan: EventPlan; locale: string }): React.ReactElement {
  const money = (minor: number): string => formatMoneyWhole(minor, plan.currency, locale);
  return (
    <section aria-labelledby="line-impact-heading" className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-card">
      <h2 id="line-impact-heading" className="font-bold text-lg">
        Budget lines
      </h2>
      {diff.lines.length === 0 ? (
        <p className="text-muted-foreground text-sm">No line changes.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {diff.lines.map((line) => {
            const before = line.before?.amount ?? null;
            const after = line.after?.amount ?? null;
            const moved = before !== null && after !== null && before !== after;
            return (
              <li key={line.id} className="flex flex-col gap-2 rounded-xl border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="wrap-anywhere font-semibold">{line.name}</h3>
                  <p className="flex items-center gap-1.5 tabular-nums">
                    {moved ? (
                      <>
                        <del className="text-muted-foreground">{money(before)}</del>
                        <ArrowRight aria-hidden="true" className="size-4" />
                        <span className="sr-only">to</span>
                        <ins className="font-bold no-underline">{money(after)}</ins>
                      </>
                    ) : (
                      <span className="font-semibold">
                        {after !== null ? money(after) : before !== null ? <del className="text-muted-foreground">{money(before)}</del> : null}
                        {line.change === "unchanged" && <span className="ms-1 font-normal text-muted-foreground text-sm">(unchanged)</span>}
                      </span>
                    )}
                  </p>
                </div>
                <Flags line={line} locale={locale} plan={plan} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TaskRow({ task, locale }: { task: TaskDiff; locale: string }): React.ReactElement {
  const date = (d: string | null): string => (d ? formatDate(d, locale) : "none");
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="wrap-anywhere font-semibold">{task.title}</h3>
        <span className="flex flex-wrap gap-1.5">
          {task.change === "added" && (
            <Badge variant="info" className="text-info-foreground">
              <CirclePlus aria-hidden="true" />
              New task
            </Badge>
          )}
          {task.change === "removed" && (
            <Badge variant="error" className="text-destructive-foreground">
              <CircleMinus aria-hidden="true" />
              Removed
            </Badge>
          )}
          {task.compressed && (
            <Badge variant="warning" className="text-warning-foreground">
              <TriangleAlert aria-hidden="true" />
              Compressed
            </Badge>
          )}
        </span>
      </div>
      {task.deadline.changed && (
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          Due <del className="text-muted-foreground">{date(task.deadline.before)}</del>
          <ArrowRight aria-hidden="true" className="size-3.5" />
          <span className="sr-only">to</span>
          <ins className="font-semibold no-underline">{date(task.deadline.after)}</ins>
        </p>
      )}
      {task.status.changed && task.status.before && task.status.after && (
        <p className="text-muted-foreground text-sm">
          {STATUS_TEXT[task.status.before]} → {STATUS_TEXT[task.status.after]}
        </p>
      )}
    </li>
  );
}

/** EM-52 (c): tasks whose deadline or status changed, old → new; worse statuses marked Compressed (EM-46). */
export function TaskImpact({ diff, locale }: { diff: PlanDiff; locale: string }): React.ReactElement {
  return (
    <section aria-labelledby="task-impact-heading" className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-card">
      <h2 id="task-impact-heading" className="font-bold text-lg">
        Timeline
      </h2>
      {diff.tasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">No deadline or status changes.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {diff.tasks.map((task) => (
            <TaskRow key={task.id} task={task} locale={locale} />
          ))}
        </ul>
      )}
    </section>
  );
}
