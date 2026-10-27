"use client";

import { useCallback, useEffect, useState } from "react";
import { VersionConflictError } from "@/data/repository";
import { DomainError } from "@/domain/errors";
import type { EventPlan } from "@/domain/schemas";
import { useSignedIn } from "@/features/auth/auth-provider";

export type SaveState = "saved" | "saving" | "failed";

export interface EditorNotice {
  kind: "conflict" | "refused" | "failed";
  message: string;
}

export interface PlanEditor {
  /** The plan to render: the user's latest edit while it saves, then the stored plan. */
  plan: EventPlan;
  save: SaveState;
  busy: boolean;
  notice: EditorNotice | null;
  dismissNotice(): void;
  /**
   * Applies a pure domain edit and saves it with the version check (EM-62). `description` names the
   * change for the conflict notice ("your change to Venue hire"). Resolves true once saved.
   */
  edit(description: string, change: (plan: EventPlan) => EventPlan): Promise<boolean>;
}

/**
 * Dashboard editing (EM-16, EM-39, EM-62). The edited plan renders at once, so totals and
 * percentages update in the same render; one write per edit; a refused write reloads the latest plan
 * and says which change was lost, so it can be redone.
 */
export function usePlanEditor(stored: EventPlan): PlanEditor {
  const { repository } = useSignedIn();
  const [pending, setPending] = useState<EventPlan | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const [notice, setNotice] = useState<EditorNotice | null>(null);

  // Once the live subscription delivers the saved version (or a newer one), show the stored plan.
  useEffect(() => {
    if (pending && stored.version >= pending.version) setPending(null);
  }, [stored.version, pending]);

  const current = pending ?? stored;

  const edit = useCallback(
    async (description: string, change: (plan: EventPlan) => EventPlan): Promise<boolean> => {
      let next: EventPlan;
      try {
        next = change(current);
      } catch (error) {
        setNotice({ kind: "refused", message: error instanceof DomainError ? error.message : "That change isn't possible." });
        return false;
      }
      setNotice(null);
      setPending(next);
      setSave("saving");
      try {
        // The stored copy carries version + 1; keep showing it until the subscription catches up.
        setPending(await repository.saveEvent(next, current.version));
        setSave("saved");
        return true;
      } catch (error) {
        setPending(null);
        if (error instanceof VersionConflictError) {
          setSave("saved");
          setNotice({
            kind: "conflict",
            message: `Someone else changed this event. You're now seeing the latest version. Your change wasn't saved: ${description}. Please make it again.`,
          });
        } else {
          setSave("failed");
          setNotice({ kind: "failed", message: `Your change couldn't be saved: ${description}. Check your connection and try again.` });
        }
        return false;
      }
    },
    [current, repository],
  );

  return { plan: current, save, busy: save === "saving", notice, dismissNotice: () => setNotice(null), edit };
}
