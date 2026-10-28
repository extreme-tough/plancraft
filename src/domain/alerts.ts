import { summarizeBudget } from "./budget";
import { compareDates, daysBetween, type IsoDate } from "./dates";
import { formatDate, formatMoneyWhole } from "./format";
import type { QuoteView } from "./quote-checks";
import { computeSchedule } from "./schedule";
import type { EventPlan } from "./schemas";

/**
 * EM-65: the notifications bell, built only from calculated alerts: nothing is pushed or emailed,
 * and nothing here is stored except the ids the user dismissed (plan.dismissedAlerts). Each id names
 * the thing and its state (and stays within the 80 characters stored per id), so an alert that comes back in a new state (a new due date, a different
 * overrun) shows again.
 */
export type PlanAlert =
  | { id: string; kind: "task_overdue" | "task_tight"; taskId: string; title: string; deadline: IsoDate }
  | { id: string; kind: "confirmed_overrun"; overrun: number }
  | { id: string; kind: "balance_due"; lineId: string; name: string; due: IsoDate; days: number; balance: number }
  | { id: string; kind: "quote_flag"; lineId: string; name: string; flags: Array<"total_gap" | "tax_unclear" | "excl_tax"> };

/** EM-64: a balance due within this many days (or already past) raises an alert. */
export const BALANCE_DUE_DAYS = 7;

const FLAG_CODE = { total_gap: "g", tax_unclear: "u", excl_tax: "x" } as const;

/** The plan's alerts, most urgent first. `linkedViews` maps a line id to the checks on its linked quote. */
export function planAlerts(plan: EventPlan, today: IsoDate, linkedViews: ReadonlyMap<string, QuoteView> = new Map()): PlanAlert[] {
  const alerts: PlanAlert[] = [];
  const schedule = computeSchedule(plan, today);

  const { confirmedOverrun } = summarizeBudget(plan);
  if (confirmedOverrun > 0) alerts.push({ id: `overrun:${confirmedOverrun}`, kind: "confirmed_overrun", overrun: confirmedOverrun });

  for (const task of plan.tasks) {
    const s = schedule.get(task.id);
    if (s?.status === "overdue" || s?.status === "tight") {
      const kind = s.status === "overdue" ? "task_overdue" : "task_tight";
      alerts.push({ id: `${s.status}:${task.id}:${s.deadline}`, kind, taskId: task.id, title: task.title, deadline: s.deadline });
    }
  }

  for (const line of plan.lines) {
    const payment = line.payment;
    if (payment?.balanceDue && payment.paid < line.amount) {
      const days = daysBetween(today, payment.balanceDue);
      if (days <= BALANCE_DUE_DAYS) {
        alerts.push({ id: `balance:${line.id}:${payment.balanceDue}`, kind: "balance_due", lineId: line.id, name: line.name, due: payment.balanceDue, days, balance: line.amount - payment.paid });
      }
    }
    const view = line.quoteId ? linkedViews.get(line.id) : undefined;
    if (view && view.quote.id === line.quoteId) {
      const flags: Array<"total_gap" | "tax_unclear" | "excl_tax"> = [];
      if (view.totalCheck.kind === "gap") flags.push("total_gap");
      if (view.details.taxTreatment === "unclear") flags.push("tax_unclear");
      if (view.exclTax) flags.push("excl_tax");
      if (flags.length > 0) alerts.push({ id: `quote:${view.quote.id}:${flags.map((f) => FLAG_CODE[f]).join("")}`, kind: "quote_flag", lineId: line.id, name: line.name, flags });
    }
  }

  const rank = { confirmed_overrun: 0, task_overdue: 1, balance_due: 2, task_tight: 3, quote_flag: 4 } as const;
  const due = (a: PlanAlert): string => (a.kind === "task_overdue" || a.kind === "task_tight" ? a.deadline : a.kind === "balance_due" ? a.due : "");
  return alerts.sort((a, b) => rank[a.kind] - rank[b.kind] || compareDates(due(a), due(b)));
}

/** The alerts the user hasn't dismissed. */
export function activeAlerts(plan: EventPlan, alerts: readonly PlanAlert[]): PlanAlert[] {
  const dismissed = new Set(plan.dismissedAlerts);
  return alerts.filter((alert) => !dismissed.has(alert.id));
}

/**
 * Dismisses one alert. Ids that no longer match a current alert are dropped, so the stored list
 * stays within its 50-id limit.
 */
export function dismissAlert(plan: EventPlan, id: string, current: readonly PlanAlert[]): EventPlan {
  const live = new Set(current.map((alert) => alert.id));
  const kept = plan.dismissedAlerts.filter((d) => live.has(d) && d !== id);
  return { ...plan, dismissedAlerts: [...kept, id].slice(-50) };
}

/** The alert as one sentence. */
export function alertText(alert: PlanAlert, currency: string, locale: string): string {
  switch (alert.kind) {
    case "confirmed_overrun":
      return `Confirmed costs are ${formatMoneyWhole(alert.overrun, currency, locale)} over the budget.`;
    case "task_overdue":
      return `Overdue: ${alert.title} (was due ${formatDate(alert.deadline, locale)}).`;
    case "task_tight":
      return `Start now: ${alert.title} is due ${formatDate(alert.deadline, locale)}.`;
    case "balance_due": {
      const balance = formatMoneyWhole(alert.balance, currency, locale);
      if (alert.days < 0) return `Payment overdue: ${balance} for ${alert.name} was due ${formatDate(alert.due, locale)}.`;
      const when = alert.days === 0 ? "today" : alert.days === 1 ? "tomorrow" : `in ${alert.days} days`;
      return `Payment due ${when}: ${balance} for ${alert.name}, by ${formatDate(alert.due, locale)}.`;
    }
    case "quote_flag": {
      const words = { total_gap: "a gap in its total", tax_unclear: "unclear tax", excl_tax: "tax not included" };
      return `The quote linked to ${alert.name} has ${alert.flags.map((f) => words[f]).join(" and ")}.`;
    }
  }
}
