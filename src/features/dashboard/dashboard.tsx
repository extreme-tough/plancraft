"use client";

import { CircleAlert, CircleCheck, CloudOff, GitCompareArrows, HelpCircle, Info, Lightbulb, Loader, MessageSquareText, SlidersHorizontal, TriangleAlert, X, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { summarizeBudget } from "@/domain/budget";
import {
  addLine,
  addTask,
  confirmLine,
  removeLine,
  removeTask,
  setTaskStatus,
  unconfirmLine,
  updateLine,
  updateTask,
} from "@/domain/edits";
import { formatDate, formatMoneyWhole } from "@/domain/format";
import { computeSchedule, nextUp, progressPercent } from "@/domain/schedule";
import type { EventPlan, Task } from "@/domain/schemas";
import { useSignedIn } from "@/features/auth/auth-provider";
import { AskSheet, ConstraintSheet } from "@/features/revision/change-sheets";
import { BudgetLines } from "./budget-lines";
import { HeroCard } from "./hero-card";
import { LineSheet, type LineSave } from "./line-sheet";
import { TaskSheet, type TaskSave } from "./task-sheet";
import { needsAttention, TaskTimeline } from "./task-timeline";
import { usePlanEditor, type PlanEditor, type SaveState } from "./use-plan-editor";

function useOnline(): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("online", notify);
      window.addEventListener("offline", notify);
      return () => {
        window.removeEventListener("online", notify);
        window.removeEventListener("offline", notify);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** EM-39: the save state, as text and an icon, announced politely. */
function SaveStatus({ save }: { save: SaveState }): React.ReactElement {
  const online = useOnline();
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm">
      {!online ? (
        <>
          <CloudOff aria-hidden="true" className="size-4 text-warning-foreground" />
          Offline: changes can&apos;t be saved until you reconnect
        </>
      ) : save === "saving" ? (
        <>
          <Loader aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
          Saving…
        </>
      ) : save === "failed" ? (
        <>
          <CircleAlert aria-hidden="true" className="size-4 text-destructive-foreground" />
          Not saved
        </>
      ) : (
        <>
          <CircleCheck aria-hidden="true" className="size-4 text-success-foreground" />
          Saved
        </>
      )}
    </p>
  );
}

/** Figma's at-risk banner: tasks needing attention and any shortfall, dismissible for this visit. */
function AtRiskBanner({ plan, today, locale }: { plan: EventPlan; today: string; locale: string }): React.ReactElement | null {
  const [dismissed, setDismissed] = useState(false);
  const schedule = computeSchedule(plan, today);
  const atRisk = plan.tasks.filter((task) => needsAttention(task, schedule.get(task.id))).length;
  const { shortfall } = summarizeBudget(plan);
  if (dismissed || (atRisk === 0 && shortfall === 0)) return null;
  const parts = [
    atRisk > 0 && `${atRisk} ${atRisk === 1 ? "task needs" : "tasks need"} attention`,
    shortfall > 0 && `Over budget by ${formatMoneyWhole(shortfall, plan.currency, locale)}`,
  ].filter(Boolean);
  return (
    <Alert variant="warning" className="flex items-start gap-3">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
      <div className="flex-1">
        <AlertTitle className="text-warning-foreground">{parts.join(" · ")}</AlertTitle>
        <AlertDescription>
          Check the flagged tasks below{shortfall > 0 ? ", and trim or rebalance lines to fit the budget" : ""}.
        </AlertDescription>
      </div>
      <Button variant="ghost" size="icon" aria-label="Dismiss this notice" onClick={() => setDismissed(true)}>
        <X aria-hidden="true" />
      </Button>
    </Alert>
  );
}

/** EM-24, EM-26: up to 3 tasks that are ready to start, by deadline then priority, each one click from done. */
function NextUp({ editor, today, locale }: { editor: PlanEditor; today: string; locale: string }): React.ReactElement {
  const { plan } = editor;
  const schedule = computeSchedule(plan, today);
  const ready = nextUp(plan, today);
  const progress = progressPercent(plan.tasks);
  const markDone = (task: Task): void => void editor.edit(`marking "${task.title}" done`, (p) => setTaskStatus(p, task.id, "done"));
  const [first, ...rest] = ready;

  return (
    <section aria-labelledby="next-up-heading" className="flex flex-col gap-4 rounded-2xl border bg-accent p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="next-up-heading" className="flex items-center gap-2 font-bold text-xl">
          <Zap aria-hidden="true" className="size-5 text-accent-foreground" />
          Next up
        </h2>
        <p className="text-sm">
          {progress}% of tasks done ({plan.tasks.filter((t) => t.status === "done").length} of {plan.tasks.length})
        </p>
      </div>
      {!first ? (
        <p>{plan.tasks.length > 0 && plan.tasks.every((t) => t.status === "done") ? "Every task is done." : "No task is ready to start yet."}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {[first, ...rest].map((task, i) => {
            const due = schedule.get(task.id);
            const waiting = plan.tasks.filter((t) => t.dependsOn.includes(task.id)).length;
            return (
              <li key={task.id} className={i === 0 ? "flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4" : "flex flex-wrap items-center justify-between gap-3 px-1"}>
                <div className="min-w-0">
                  <p className={i === 0 ? "wrap-anywhere font-bold text-lg" : "wrap-anywhere font-semibold"}>{task.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {due && `Due ${formatDate(due.deadline, locale)}`}
                    {waiting > 0 && ` · ${waiting} ${waiting === 1 ? "task waits" : "tasks wait"} for this`}
                  </p>
                </div>
                <Button size={i === 0 ? "lg" : "sm"} variant={i === 0 ? "default" : "outline"} onClick={() => markDone(task)} disabled={editor.busy} aria-label={`Mark done: ${task.title}`}>
                  <CircleCheck aria-hidden="true" />
                  Mark done
                </Button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** UX-09: what the plan assumed, and what would most improve it (EM-11). */
function AssumptionsPanel({ plan }: { plan: EventPlan }): React.ReactElement | null {
  if (plan.assumptions.length === 0 && plan.openQuestions.length === 0) return null;
  return (
    <section aria-labelledby="assumptions-heading" className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card sm:p-6">
      <h2 id="assumptions-heading" className="flex items-center gap-2 font-bold text-xl">
        <Lightbulb aria-hidden="true" className="size-5 text-accent-foreground" />
        Assumptions
      </h2>
      <p className="text-muted-foreground text-sm">What the plan assumed because it wasn&apos;t in your answers. Check these first.</p>
      <ul className="list-disc ps-5">
        {plan.assumptions.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
      {plan.openQuestions.length > 0 && (
        <>
          <h3 className="flex items-center gap-2 font-semibold">
            <HelpCircle aria-hidden="true" className="size-4 text-accent-foreground" />
            Open questions
          </h3>
          <ul className="list-disc ps-5">
            {plan.openQuestions.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * Revisions (EM-27, EM-08, UX-01): change budget, date or guests, or ask in your own words. A pending
 * revision is linked here until it is applied or discarded (one at a time, §8.6).
 */
function ChangeBar({ plan, onConstraints, onAsk }: { plan: EventPlan; onConstraints: () => void; onAsk: () => void }): React.ReactElement {
  const { repository } = useSignedIn();
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    repository
      .listProposals(plan.id)
      .then((proposals) => active && setPending(proposals.find((p) => p.kind === "revision")?.id ?? null))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [repository, plan.id, plan.version]);

  return (
    <section aria-label="Change the plan" className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm">Plans change. See the effect on every line and task before anything is saved.</p>
      <div className="flex flex-wrap gap-2">
        {pending && (
          <Button variant="secondary" render={<Link href={`/events/${plan.id}/revise?proposal=${pending}`} />}>
            <GitCompareArrows aria-hidden="true" />
            Review the pending revision
          </Button>
        )}
        <Button variant="outline" onClick={onConstraints}>
          <SlidersHorizontal aria-hidden="true" />
          Change budget, date or guests
        </Button>
        <Button variant="outline" onClick={onAsk}>
          <MessageSquareText aria-hidden="true" />
          Ask for a change
        </Button>
      </div>
    </section>
  );
}

type Sheet = { kind: "line"; id: string | null } | { kind: "task"; id: string | null } | { kind: "constraints" } | { kind: "ask" } | null;

/**
 * The Plan Dashboard (Figma 0:874 / 0:503; EM-06, EM-13, EM-16, EM-20, EM-22–EM-26, UX-09).
 * Every edit is a pure domain function, rendered at once and saved with the version check (EM-62).
 */
export function Dashboard({ stored, today, locale }: { stored: EventPlan; today: string; locale: string }): React.ReactElement {
  const editor = usePlanEditor(stored);
  const { plan } = editor;
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = (open: boolean): void => {
    if (!open) setSheet(null);
  };
  // EM-62: a refused save closes the sheet, so the notice and the version that won are in view.
  const conflicted = editor.notice?.kind === "conflict";
  useEffect(() => {
    if (conflicted) setSheet(null);
  }, [conflicted]);

  const editingLine = sheet?.kind === "line" && sheet.id ? (plan.lines.find((l) => l.id === sheet.id) ?? null) : null;
  const editingTask = sheet?.kind === "task" && sheet.id ? (plan.tasks.find((t) => t.id === sheet.id) ?? null) : null;

  const saveLine = ({ input, confirmed }: LineSave): Promise<boolean> => {
    const name = input.name.trim() || "the new line";
    if (!editingLine) return editor.edit(`adding "${name}"`, (p) => addLine(p, crypto.randomUUID(), input));
    const id = editingLine.id;
    return editor.edit(`your change to "${editingLine.name}"`, (p) => {
      let next = p;
      // Un-confirm before repricing; confirm after (EM-20).
      if (confirmed === false && editingLine.label === "confirmed") next = unconfirmLine(next, id);
      next = updateLine(next, id, input);
      if (confirmed === true && editingLine.label !== "confirmed") next = confirmLine(next, id);
      return next;
    });
  };

  const saveTask = ({ input, status }: TaskSave): Promise<boolean> => {
    if (!editingTask) {
      const id = crypto.randomUUID();
      return editor.edit(`adding "${input.title.trim() || "the new task"}"`, (p) => {
        const added = addTask(p, id, input);
        return status === "not_started" ? added : setTaskStatus(added, id, status);
      });
    }
    const id = editingTask.id;
    return editor.edit(`your change to "${editingTask.title}"`, (p) => setTaskStatus(updateTask(p, id, input), id, status));
  };

  const toggleDone = (task: Task): void =>
    void editor.edit(task.status === "done" ? `reopening "${task.title}"` : `marking "${task.title}" done`, (p) =>
      setTaskStatus(p, task.id, task.status === "done" ? "not_started" : "done"),
    );

  return (
    <div className="flex flex-col gap-6">
      <AtRiskBanner plan={plan} today={today} locale={locale} />
      <HeroCard plan={plan} today={today} locale={locale} status={<SaveStatus save={editor.save} />} />

      {/* EM-06: always shown on the plan screen. */}
      <Alert variant="info">
        <Info aria-hidden="true" />
        <AlertDescription className="font-medium text-foreground">This is a starting point. Edit anything.</AlertDescription>
      </Alert>

      <div aria-live="polite">
        {editor.notice && (
          <Alert variant={editor.notice.kind === "refused" ? "warning" : "error"} className="flex items-start gap-3">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              <AlertTitle>{editor.notice.kind === "conflict" ? "Someone else changed this event" : editor.notice.kind === "refused" ? "That change wasn't made" : "Not saved"}</AlertTitle>
              <AlertDescription>{editor.notice.message}</AlertDescription>
            </div>
            <Button variant="ghost" size="icon" aria-label="Dismiss this message" onClick={editor.dismissNotice}>
              <X aria-hidden="true" />
            </Button>
          </Alert>
        )}
      </div>

      <ChangeBar plan={plan} onConstraints={() => setSheet({ kind: "constraints" })} onAsk={() => setSheet({ kind: "ask" })} />

      {plan.tasks.length > 0 && <NextUp editor={editor} today={today} locale={locale} />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <BudgetLines plan={plan} locale={locale} disabled={editor.busy} onEdit={(id) => setSheet({ kind: "line", id })} onAdd={() => setSheet({ kind: "line", id: null })} />
        <div className="flex min-w-0 flex-col gap-6">
          <TaskTimeline
            plan={plan}
            today={today}
            locale={locale}
            disabled={editor.busy}
            onToggleDone={toggleDone}
            onEdit={(id) => setSheet({ kind: "task", id })}
            onAdd={() => setSheet({ kind: "task", id: null })}
          />
          <AssumptionsPanel plan={plan} />
        </div>
      </div>

      {sheet?.kind === "line" && (
        <LineSheet
          key={sheet.id ?? "new"}
          plan={plan}
          line={editingLine}
          open
          locale={locale}
          busy={editor.busy}
          onOpenChange={close}
          onSave={saveLine}
          onDelete={() => (editingLine ? editor.edit(`deleting "${editingLine.name}"`, (p) => removeLine(p, editingLine.id)) : Promise.resolve(false))}
        />
      )}
      {sheet?.kind === "constraints" && <ConstraintSheet plan={plan} today={today} locale={locale} open onOpenChange={close} />}
      {sheet?.kind === "ask" && <AskSheet plan={plan} today={today} open onOpenChange={close} />}
      {sheet?.kind === "task" && (
        <TaskSheet
          key={sheet.id ?? "new"}
          plan={plan}
          task={editingTask}
          open
          busy={editor.busy}
          onOpenChange={close}
          onSave={saveTask}
          onDelete={() => (editingTask ? editor.edit(`deleting "${editingTask.title}"`, (p) => removeTask(p, editingTask.id)) : Promise.resolve(false))}
        />
      )}
    </div>
  );
}
