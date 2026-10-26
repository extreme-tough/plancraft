import { addDays, compareDates, maxDate, minDate, type IsoDate } from "./dates";
import { topologicalOrder } from "./graph";
import type { EventPlan, Task } from "./schemas";

/** Calculated per task, never stored (EM-24, EM-25, EM-26, EM-46). */
export interface TaskSchedule {
  deadline: IsoDate;
  latestStart: IsoDate;
  status: ScheduleStatus;
  /** Every dependency is done, so the task can start (EM-24). */
  available: boolean;
  /** Forward pass from today: the earliest it can finish given unfinished dependencies (EM-25). */
  earliestFinish: IsoDate | null;
  /** Its earliest finish is after its deadline (EM-25). */
  atRisk: boolean;
}

export type ScheduleStatus = "done" | "on_track" | "tight" | "overdue";

/**
 * Deadlines counted back from the event (EM-46):
 *   deadline(t) = min(eventDate − leadTimeDays(t), min over tasks s that depend on t of deadline(s) − durationDays(s))
 *   latestStart(t) = deadline(t) − durationDays(t)
 * Not done: overdue if deadline < today; tight if latestStart < today ≤ deadline; else on track.
 * Tasks are never dropped and deadlines are never moved to fit.
 */
export function computeSchedule(
  plan: Pick<EventPlan, "eventDate" | "tasks">,
  today: IsoDate,
): Map<string, TaskSchedule> {
  const order = topologicalOrder(plan.tasks);
  const dependents = new Map<string, Task[]>();
  for (const task of plan.tasks) {
    for (const dependency of task.dependsOn) dependents.set(dependency, [...(dependents.get(dependency) ?? []), task]);
  }

  // Backward pass: dependents come later in topological order, so walk it in reverse.
  const deadlines = new Map<string, IsoDate>();
  for (const task of [...order].reverse()) {
    let deadline = addDays(plan.eventDate, -task.leadTimeDays);
    for (const dependent of dependents.get(task.id) ?? []) {
      const dependentDeadline = deadlines.get(dependent.id);
      if (dependentDeadline) deadline = minDate(deadline, addDays(dependentDeadline, -dependent.durationDays));
    }
    deadlines.set(task.id, deadline);
  }

  // Forward pass from today over unfinished work.
  const byId = new Map(plan.tasks.map((task) => [task.id, task]));
  const finishes = new Map<string, IsoDate | null>();
  for (const task of order) {
    if (task.status === "done") {
      finishes.set(task.id, null);
      continue;
    }
    let start = today;
    for (const dependency of task.dependsOn) {
      const finish = finishes.get(dependency);
      if (finish) start = maxDate(start, finish);
    }
    finishes.set(task.id, addDays(start, task.durationDays));
  }

  const schedule = new Map<string, TaskSchedule>();
  for (const task of plan.tasks) {
    const deadline = deadlines.get(task.id) as IsoDate;
    const latestStart = addDays(deadline, -task.durationDays);
    const earliestFinish = finishes.get(task.id) ?? null;
    let status: ScheduleStatus = "on_track";
    if (task.status === "done") status = "done";
    else if (compareDates(deadline, today) < 0) status = "overdue";
    else if (compareDates(latestStart, today) < 0) status = "tight";

    schedule.set(task.id, {
      deadline,
      latestStart,
      status,
      available: task.status !== "done" && task.dependsOn.every((id) => byId.get(id)?.status === "done"),
      earliestFinish,
      atRisk: earliestFinish !== null && compareDates(earliestFinish, deadline) > 0,
    });
  }
  return schedule;
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** "Next up" (EM-26): up to 3 available tasks, by deadline then priority. */
export function nextUp(plan: Pick<EventPlan, "eventDate" | "tasks">, today: IsoDate, limit = 3): Task[] {
  const schedule = computeSchedule(plan, today);
  return plan.tasks
    .filter((task) => schedule.get(task.id)?.available)
    .sort((a, b) => {
      const byDeadline = compareDates(
        schedule.get(a.id)?.deadline ?? "",
        schedule.get(b.id)?.deadline ?? "",
      );
      return byDeadline !== 0 ? byDeadline : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    })
    .slice(0, limit);
}

/** Share of tasks done, in whole percent (EM-24). */
export function progressPercent(tasks: readonly Task[]): number {
  if (tasks.length === 0) return 0;
  return Math.round((tasks.filter((task) => task.status === "done").length * 100) / tasks.length);
}
