"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { unpickableDependencies, type TaskInput } from "@/domain/edits";
import type { EventPlan, Task } from "@/domain/schemas";
import { FormField } from "@/features/event-create/form-field";
import { NativeSelect } from "./native-select";

export interface TaskSave {
  input: TaskInput;
  status: Task["status"];
}

interface Draft {
  title: string;
  priority: Task["priority"];
  status: Task["status"];
  leadTimeDays: string;
  durationDays: string;
  lineId: string;
  dependsOn: string[];
}

function wholeNumber(text: string, min: number, max: number): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return value >= min && value <= max ? value : null;
}

/**
 * Add or edit a task (EM-22, EM-23, EM-45, EM-46). Tasks that already wait for this one are greyed
 * out in the dependency list, so a loop can't be picked; anything else that would loop is refused
 * by the domain with the loop named.
 */
export function TaskSheet({
  plan,
  task,
  open,
  busy,
  onOpenChange,
  onSave,
  onDelete,
}: {
  plan: EventPlan;
  /** null adds a new task. */
  task: Task | null;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (save: TaskSave) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}): React.ReactElement {
  const [draft, setDraft] = useState<Draft>(() => ({
    title: task?.title ?? "",
    priority: task?.priority ?? "medium",
    status: task?.status ?? "not_started",
    leadTimeDays: String(task?.leadTimeDays ?? 30),
    durationDays: String(task?.durationDays ?? 7),
    lineId: task?.lineId ?? "",
    dependsOn: task?.dependsOn ?? [],
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<Draft>): void => setDraft((d) => ({ ...d, ...patch }));
  const blocked = unpickableDependencies(plan, task?.id ?? null);
  const others = plan.tasks.filter((t) => t.id !== task?.id);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (draft.title.trim() === "") next.title = "Enter a title for the task.";
    const leadTimeDays = wholeNumber(draft.leadTimeDays, 0, 540);
    const durationDays = wholeNumber(draft.durationDays, 1, 90);
    if (leadTimeDays === null) next.leadTimeDays = "Enter a whole number of days from 0 to 540.";
    if (durationDays === null) next.durationDays = "Enter a whole number of days from 1 to 90.";
    setErrors(next);
    if (leadTimeDays === null || durationDays === null || Object.keys(next).length > 0) return;

    const saved = await onSave({
      input: {
        title: draft.title,
        priority: draft.priority,
        leadTimeDays,
        durationDays,
        lineId: draft.lineId === "" ? null : draft.lineId,
        dependsOn: draft.dependsOn,
      },
      status: draft.status,
    });
    if (saved) onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup>
        <form onSubmit={(e) => void submit(e)} className="flex h-full min-h-0 flex-col" noValidate>
          <SheetHeader>
            <SheetTitle className="wrap-anywhere pe-8">{task ? `Edit ${task.title}` : "Add a task"}</SheetTitle>
            <SheetDescription>Deadlines are counted back from the event date.</SheetDescription>
          </SheetHeader>
          <SheetPanel className="flex flex-col gap-5">
            <FormField id="task-title" label="Title" error={errors.title}>
              {(aria) => <Input {...aria} value={draft.title} maxLength={100} onChange={(e) => set({ title: e.target.value })} />}
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="task-priority" label="Priority">
                {(aria) => (
                  <NativeSelect {...aria} value={draft.priority} onChange={(e) => set({ priority: e.target.value as Task["priority"] })}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </NativeSelect>
                )}
              </FormField>
              <FormField id="task-status" label="Status">
                {(aria) => (
                  <NativeSelect {...aria} value={draft.status} onChange={(e) => set({ status: e.target.value as Task["status"] })}>
                    <option value="not_started">Not started</option>
                    <option value="in_progress">In progress</option>
                    <option value="done">Done</option>
                  </NativeSelect>
                )}
              </FormField>
              <FormField id="task-lead" label="Finish this many days before the event" error={errors.leadTimeDays}>
                {(aria) => <Input {...aria} inputMode="numeric" value={draft.leadTimeDays} onChange={(e) => set({ leadTimeDays: e.target.value })} />}
              </FormField>
              <FormField id="task-duration" label="Takes this many days" error={errors.durationDays}>
                {(aria) => <Input {...aria} inputMode="numeric" value={draft.durationDays} onChange={(e) => set({ durationDays: e.target.value })} />}
              </FormField>
            </div>

            <FormField id="task-line" label="Budget line" optional>
              {(aria) => (
                <NativeSelect {...aria} value={draft.lineId} onChange={(e) => set({ lineId: e.target.value })}>
                  <option value="">None</option>
                  {plan.lines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>

            {others.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 font-medium text-sm">Do this after</legend>
                <p id="task-deps-hint" className="text-muted-foreground text-sm">
                  Greyed-out tasks already wait for this one, so picking them would create a loop.
                </p>
                <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border p-2" aria-describedby="task-deps-hint">
                  {others.map((other) => {
                    const unavailable = blocked.has(other.id);
                    const checked = draft.dependsOn.includes(other.id);
                    return (
                      <li key={other.id}>
                        <label className="flex items-center gap-2 rounded-md px-1 py-1 text-sm has-data-disabled:text-muted-foreground">
                          <Checkbox
                            checked={checked}
                            disabled={unavailable && !checked}
                            onCheckedChange={(on) =>
                              set({ dependsOn: on ? [...draft.dependsOn, other.id] : draft.dependsOn.filter((id) => id !== other.id) })
                            }
                          />
                          <span className="wrap-anywhere">{other.title}</span>
                          {unavailable && !checked && <span className="sr-only">(waits for this task)</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}
          </SheetPanel>
          <SheetFooter className="flex-row flex-wrap justify-between gap-2">
            {task ? (
              <Button type="button" variant="outline" className="text-destructive-foreground" disabled={busy} onClick={() => void onDelete().then((ok) => ok && onOpenChange(false))}>
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Save
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetPopup>
    </Sheet>
  );
}
