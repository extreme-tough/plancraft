"use client";

import { CircleAlert, HelpCircle, Lightbulb, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { summarizeBudget } from "@/domain/budget";
import { CATEGORIES, type EventPlan } from "@/domain/schemas";
import { formatDate, formatMoneyCompact } from "@/domain/format";
import { isUnderFunded, lineEstimateTotal } from "@/domain/plan-build";
import { computeSchedule } from "@/domain/schedule";
import { CATEGORY_TEXT } from "@/lib/display-names";

/**
 * The generated plan, read-only until the dashboard slice (S5) adds editing: the budget split, each
 * line with its AI Estimate label, range and assumptions (EM-19, UX-09), the tasks by deadline with
 * their dependencies (EM-21, EM-23), and the plan's assumptions and open questions (EM-11).
 * Every number here is calculated by code on read.
 */
export function PlanOverview({ plan, today, locale }: { plan: EventPlan; today: string; locale: string }): React.ReactElement {
  const money = (minor: number): string => formatMoneyCompact(minor, plan.currency, locale);
  const budget = summarizeBudget(plan);
  const schedule = computeSchedule(plan, today);
  const titleOf = new Map(plan.tasks.map((task) => [task.id, task.title]));
  const priorityRank = { high: 0, medium: 1, low: 2 } as const;
  const tasks = [...plan.tasks].sort((a, b) => {
    const byDeadline = (schedule.get(a.id)?.deadline ?? "").localeCompare(schedule.get(b.id)?.deadline ?? "");
    return byDeadline !== 0 ? byDeadline : priorityRank[a.priority] - priorityRank[b.priority];
  });

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle render={<h2 />}>Budget</CardTitle>
          <CardDescription>
            {money(budget.allocated)} allocated of {money(budget.budget)} ·{" "}
            {budget.remaining >= 0 ? `${money(budget.remaining)} remaining` : `${money(budget.shortfall)} over budget`}
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <ul className="flex flex-col divide-y">
            {plan.lines.map((line) => {
              const estimate = lineEstimateTotal(line, plan.guestCount);
              const share = (budget.percentTenths.get(line.id) ?? 0) / 10;
              return (
                <li key={line.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold">{line.name}</h3>
                    <span className="font-semibold tabular-nums">{money(line.amount)}</span>
                  </div>
                  <p className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                    <span>{CATEGORY_TEXT[line.category]}</span>
                    <span aria-hidden="true">·</span>
                    <span>{share.toLocaleString(locale, { maximumFractionDigits: 1 })}% of budget</span>
                    {line.pricing === "per_guest" && line.unitCost !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{money(line.unitCost)} per guest</span>
                      </>
                    )}
                    <Badge variant="info" className="text-info-foreground">
                      <Sparkles aria-hidden="true" />
                      AI Estimate
                    </Badge>
                    {isUnderFunded(line, plan.guestCount) && (
                      <Badge variant="warning" className="text-warning-foreground">
                        <CircleAlert aria-hidden="true" />
                        Under-funded
                      </Badge>
                    )}
                  </p>
                  {estimate && (
                    <p className="text-sm">
                      Typical range: {money(estimate.low)} to {money(estimate.high)}
                    </p>
                  )}
                  {line.assumptions.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer rounded-sm text-accent-foreground">Assumptions and vendor questions</summary>
                      <ul className="mt-2 list-disc ps-5 text-muted-foreground">
                        {[...line.assumptions, ...line.vendorNeeds.map((need) => `Ask for: ${need}`), ...line.vendorQuestions].map((text, i) => (
                          <li key={i}>{text}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </CardPanel>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle render={<h2 />}>Tasks</CardTitle>
          <CardDescription>By deadline, counted back from the event date.</CardDescription>
        </CardHeader>
        <CardPanel>
          <ol className="flex flex-col divide-y">
            {tasks.map((task) => {
              const due = schedule.get(task.id);
              return (
                <li key={task.id} className="flex flex-col gap-1 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold">{task.title}</h3>
                    {due && <span className="text-sm">Due {formatDate(due.deadline, locale)}</span>}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {task.priority === "high" ? "High priority" : task.priority === "medium" ? "Medium priority" : "Low priority"}
                    {task.dependsOn.length > 0 && ` · After: ${task.dependsOn.map((id) => titleOf.get(id) ?? "another task").join(", ")}`}
                    {due?.status === "overdue" && " · Overdue"}
                    {due?.status === "tight" && " · Tight"}
                  </p>
                </li>
              );
            })}
          </ol>
        </CardPanel>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle render={<h2 />} className="flex items-center gap-2">
            <Lightbulb aria-hidden="true" className="size-5 text-accent-foreground" />
            Assumptions
          </CardTitle>
          <CardDescription>What the plan assumed because it wasn&apos;t in your answers. Check these first.</CardDescription>
        </CardHeader>
        <CardPanel className="flex flex-col gap-4">
          <ul className="list-disc ps-5">
            {plan.assumptions.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
          {plan.openQuestions.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 font-semibold">
                <HelpCircle aria-hidden="true" className="size-4 text-accent-foreground" />
                Open questions
              </h3>
              <ul className="mt-2 list-disc ps-5">
                {plan.openQuestions.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </div>
          )}
        </CardPanel>
      </Card>
    </div>
  );
}

/**
 * "Start with an empty plan" (spec §7.6): the categories are listed and nothing is invented,
 * no amounts and no tasks. Adding lines and tasks by hand arrives with the dashboard (S5).
 */
export function EmptyPlan({ plan, locale }: { plan: EventPlan; locale: string }): React.ReactElement {
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle render={<h2 />}>Budget</CardTitle>
        <CardDescription>
          {formatMoneyCompact(plan.budget, plan.currency, locale)} to plan with. No lines yet: nothing has been estimated
          for you.
        </CardDescription>
      </CardHeader>
      <CardPanel>
        <h3 className="mb-2 font-semibold text-sm">Categories</h3>
        <ul className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <li key={category}>
              <Badge variant="outline" size="lg">
                {CATEGORY_TEXT[category]}
              </Badge>
            </li>
          ))}
        </ul>
      </CardPanel>
    </Card>
  );
}
