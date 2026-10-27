"use client";

import { CircleAlert, CircleCheck, CircleDashed, Clock, Pencil, Plus, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/domain/format";
import { computeSchedule, type TaskSchedule } from "@/domain/schedule";
import type { EventPlan, Task } from "@/domain/schemas";
import { cn } from "@/lib/utils";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const PRIORITY_TEXT = { high: "High priority", medium: "Medium priority", low: "Low priority" } as const;

/** EM-22: by deadline, then priority. */
export function tasksByDeadline(plan: EventPlan, schedule: Map<string, TaskSchedule>): Task[] {
  return [...plan.tasks].sort((a, b) => {
    const byDeadline = (schedule.get(a.id)?.deadline ?? "").localeCompare(schedule.get(b.id)?.deadline ?? "");
    return byDeadline !== 0 ? byDeadline : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });
}

/** A task needs attention when it isn't done and is overdue, tight, or can't finish in time (EM-25, EM-46). */
export function needsAttention(task: Task, schedule: TaskSchedule | undefined): boolean {
  if (!schedule || task.status === "done") return false;
  return schedule.status === "overdue" || schedule.status === "tight" || schedule.atRisk;
}

/** Status as text and an icon, never colour alone (UX-11). */
function StatusBadges({ task, due }: { task: Task; due: TaskSchedule | undefined }): React.ReactElement {
  return (
    <span className="flex flex-wrap gap-1.5">
      {task.status === "done" ? (
        <Badge variant="success" className="text-success-foreground">
          <CircleCheck aria-hidden="true" />
          Done
        </Badge>
      ) : task.status === "in_progress" ? (
        <Badge variant="info" className="text-info-foreground">
          <Clock aria-hidden="true" />
          In progress
        </Badge>
      ) : (
        <Badge variant="outline">
          <CircleDashed aria-hidden="true" />
          Not started
        </Badge>
      )}
      {task.status !== "done" && due?.status === "overdue" && (
        <Badge variant="error" className="text-destructive-foreground">
          <CircleAlert aria-hidden="true" />
          Overdue
        </Badge>
      )}
      {task.status !== "done" && due?.status === "tight" && (
        <Badge variant="warning" className="text-warning-foreground">
          <TriangleAlert aria-hidden="true" />
          Tight
        </Badge>
      )}
      {task.status !== "done" && due?.status === "on_track" && due.atRisk && (
        <Badge variant="warning" className="text-warning-foreground">
          <TriangleAlert aria-hidden="true" />
          At risk
        </Badge>
      )}
    </span>
  );
}

/**
 * The task timeline (Figma "Task Timeline"): counters, then every task by deadline with its status,
 * dependencies ("After: Book venue", EM-23) and a check to mark it done (EM-24). Deadlines and
 * statuses are calculated on read (EM-46).
 */
export function TaskTimeline({
  plan,
  today,
  locale,
  disabled,
  onToggleDone,
  onEdit,
  onAdd,
}: {
  plan: EventPlan;
  today: string;
  locale: string;
  disabled: boolean;
  onToggleDone: (task: Task) => void;
  onEdit: (taskId: string) => void;
  onAdd: () => void;
}): React.ReactElement {
  const schedule = computeSchedule(plan, today);
  const tasks = tasksByDeadline(plan, schedule);
  const titleOf = new Map(plan.tasks.map((task) => [task.id, task.title]));
  const done = plan.tasks.filter((t) => t.status === "done").length;
  const inProgress = plan.tasks.filter((t) => t.status === "in_progress").length;
  const attention = plan.tasks.filter((t) => needsAttention(t, schedule.get(t.id))).length;

  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-card sm:p-6">
      <div className="flex flex-col gap-2">
        <h2 id="timeline-heading" className="font-bold text-xl">
          Task timeline
        </h2>
        <ul className="flex flex-wrap gap-2 text-sm" aria-label="Task counts">
          <li>
            <Badge variant="success" className="text-success-foreground">
              <CircleCheck aria-hidden="true" />
              {done} done
            </Badge>
          </li>
          <li>
            <Badge variant="info" className="text-info-foreground">
              <Clock aria-hidden="true" />
              {inProgress} in progress
            </Badge>
          </li>
          <li>
            <Badge variant={attention > 0 ? "warning" : "outline"} className={attention > 0 ? "text-warning-foreground" : undefined}>
              <TriangleAlert aria-hidden="true" />
              {attention} need attention
            </Badge>
          </li>
        </ul>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-muted-foreground">No tasks yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {tasks.map((task) => {
            const due = schedule.get(task.id);
            const isDone = task.status === "done";
            const flagged = needsAttention(task, due);
            return (
              <li
                key={task.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3",
                  flagged ? "border-warning/40 bg-warning/6" : "bg-background",
                )}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={isDone}
                  disabled={disabled}
                  onCheckedChange={() => onToggleDone(task)}
                  aria-label={isDone ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className={cn("wrap-anywhere font-semibold", isDone && "text-muted-foreground line-through")}>{task.title}</h3>
                    <StatusBadges task={task} due={due} />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {due && `Due ${formatDate(due.deadline, locale)}`} · {PRIORITY_TEXT[task.priority]}
                    {due?.atRisk && due.earliestFinish && ` · Earliest finish ${formatDate(due.earliestFinish, locale)}`}
                  </p>
                  {task.dependsOn.length > 0 && (
                    <p className="text-sm">After: {task.dependsOn.map((id) => titleOf.get(id) ?? "another task").join(", ")}</p>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => onEdit(task.id)} aria-label={`Edit ${task.title}`}>
                  <Pencil aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ol>
      )}

      <Button variant="outline" className="border-dashed" onClick={onAdd} disabled={disabled}>
        <Plus aria-hidden="true" />
        Add a task
      </Button>
    </section>
  );
}
