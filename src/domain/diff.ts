import { summarizeBudget, type BudgetSummary } from "./budget";
import { compareDates, type IsoDate } from "./dates";
import { deepEqual } from "./equal";
import { confirmedGuests } from "./guests";
import type { Minor } from "./money";
import { computeSchedule, type ScheduleStatus } from "./schedule";
import type { BudgetLine, EventPlan } from "./schemas";

/**
 * The before/after view of a revision (EM-52, UX-08): what changed in the budget and the timeline,
 * and what deliberately didn't. Quote effects join in slice S7.
 */
export interface PlanDiff {
  budget: { before: BudgetSummary; after: BudgetSummary };
  event: {
    budget: Change<Minor>;
    eventDate: Change<IsoDate>;
    guestCount: Change<number>;
  };
  lines: LineDiff[];
  tasks: TaskDiff[];
}

export interface Change<T> {
  before: T;
  after: T;
  changed: boolean;
}

export type LineFlag =
  /** The date moved; a quoted or confirmed vendor priced the old date (A12). */
  | "reconfirm_new_date"
  /** Confirmed per-guest line, frozen for a guest count the event no longer has (A14). */
  | "confirmed_for_other_guest_count"
  /** Per-guest line with its own count, left alone when the event count changed (A1). */
  | "own_guest_count_unchanged"
  /** Confirmed: protected from every change (EM-42). */
  | "locked";

export interface LineDiff {
  id: string;
  name: string;
  change: "added" | "removed" | "changed" | "unchanged";
  before: BudgetLine | null;
  after: BudgetLine | null;
  flags: LineFlag[];
  /** For confirmed_for_other_guest_count. */
  confirmedFor?: number;
}

export interface TaskDiff {
  id: string;
  title: string;
  change: "added" | "removed" | "changed";
  deadline: Change<IsoDate | null>;
  status: Change<ScheduleStatus | null>;
  /** Its status got worse because of this change: on track → tight or overdue, tight → overdue. */
  compressed: boolean;
}

const SEVERITY: Record<ScheduleStatus, number> = { done: 0, on_track: 1, tight: 2, overdue: 3 };

const change = <T>(before: T, after: T): Change<T> => ({ before, after, changed: before !== after });

export function diffPlans(before: EventPlan, after: EventPlan, today: IsoDate): PlanDiff {
  const dateChanged = before.eventDate !== after.eventDate;
  const guestsChanged = before.guestCount !== after.guestCount;

  const afterLines = new Map(after.lines.map((line) => [line.id, line]));
  const beforeLines = new Map(before.lines.map((line) => [line.id, line]));
  const lines: LineDiff[] = [];

  for (const old of before.lines) {
    const now = afterLines.get(old.id) ?? null;
    const flags: LineFlag[] = [];
    const subject = now ?? old;
    if (subject.label === "confirmed") flags.push("locked");
    if (dateChanged && now && (now.label === "confirmed" || now.label === "vendor_quoted")) {
      flags.push("reconfirm_new_date");
    }
    let confirmedFor: number | undefined;
    if (guestsChanged && now?.label === "confirmed" && now.guestSource === "event") {
      const frozen = confirmedGuests(now);
      if (frozen !== null && frozen !== after.guestCount) {
        flags.push("confirmed_for_other_guest_count");
        confirmedFor = frozen;
      }
    }
    if (guestsChanged && now?.pricing === "per_guest" && now.guestSource === "own") {
      flags.push("own_guest_count_unchanged");
    }

    const kind = now === null ? "removed" : deepEqual(now, old) ? "unchanged" : "changed";
    if (kind !== "unchanged" || flags.length > 0) {
      lines.push({
        id: old.id,
        name: old.name,
        change: kind,
        before: old,
        after: now,
        flags,
        ...(confirmedFor !== undefined ? { confirmedFor } : {}),
      });
    }
  }
  for (const added of after.lines) {
    if (!beforeLines.has(added.id)) {
      lines.push({ id: added.id, name: added.name, change: "added", before: null, after: added, flags: [] });
    }
  }

  const scheduleBefore = computeSchedule(before, today);
  const scheduleAfter = computeSchedule(after, today);
  const tasksAfter = new Map(after.tasks.map((task) => [task.id, task]));
  const tasksBefore = new Map(before.tasks.map((task) => [task.id, task]));
  const tasks: TaskDiff[] = [];

  for (const task of before.tasks) {
    const was = scheduleBefore.get(task.id) ?? null;
    const now = tasksAfter.has(task.id) ? (scheduleAfter.get(task.id) ?? null) : null;
    const deadline = change(was?.deadline ?? null, now?.deadline ?? null);
    const status = change(was?.status ?? null, now?.status ?? null);
    const kind = now === null ? "removed" : deadline.changed || status.changed ? "changed" : null;
    if (kind === null) continue;
    const compressed =
      was !== null && now !== null && SEVERITY[now.status] > SEVERITY[was.status] && now.status !== "done";
    tasks.push({ id: task.id, title: task.title, change: kind, deadline, status, compressed });
  }
  for (const task of after.tasks) {
    if (tasksBefore.has(task.id)) continue;
    const now = scheduleAfter.get(task.id) ?? null;
    tasks.push({
      id: task.id,
      title: task.title,
      change: "added",
      deadline: change<IsoDate | null>(null, now?.deadline ?? null),
      status: change<ScheduleStatus | null>(null, now?.status ?? null),
      compressed: false,
    });
  }
  tasks.sort((a, b) => compareDates(a.deadline.after ?? a.deadline.before ?? "", b.deadline.after ?? b.deadline.before ?? ""));

  return {
    budget: { before: summarizeBudget(before), after: summarizeBudget(after) },
    event: {
      budget: change(before.budget, after.budget),
      eventDate: change(before.eventDate, after.eventDate),
      guestCount: change(before.guestCount, after.guestCount),
    },
    lines,
    tasks,
  };
}
