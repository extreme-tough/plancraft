"use client";

import { CircleAlert, RotateCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { VersionConflictError } from "@/data/repository";
import { applyGeneratedPlan, planRequestFor } from "@/domain/plan-build";
import { PlanResponseSchema, planRuleFailures } from "@/domain/plan-contract";
import type { EventPlan } from "@/domain/schemas";
import { useSignedIn } from "@/features/auth/auth-provider";
import { callAi, type AiError } from "@/lib/ai-client";
import { localToday } from "@/lib/today";

type State =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; error: AiError; retryAt: number | null }
  | { kind: "daily-limit"; message: string; until: number }
  | { kind: "conflict" };

/** Seconds left until `at`, ticking once a second while it's in the future. */
function useSecondsUntil(at: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null || at <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [at]);
  return at === null ? 0 : Math.max(0, Math.ceil((at - now) / 1000));
}

/**
 * "Generate my plan" (AI-01, EM-03) with every fallback from spec §7.6: the event's inputs are
 * already saved, errors are announced politely, Retry waits out a 429, and "Start with an empty
 * plan" is always available. Nothing the AI returns is used before it passes the same checks as
 * on the server (AI-11).
 */
export function PlanGenerator({ plan, onStartEmpty }: { plan: EventPlan; onStartEmpty: () => void }): React.ReactElement {
  const { user, repository } = useSignedIn();
  const [state, setState] = useState<State>({ kind: "idle" });
  const waitSeconds = useSecondsUntil(state.kind === "error" ? state.retryAt : state.kind === "daily-limit" ? state.until : null);
  const dailyLimited = state.kind === "daily-limit" && waitSeconds > 0;

  const generate = async (): Promise<void> => {
    setState({ kind: "working" });
    const request = planRequestFor(plan, localToday());
    const result = await callAi("/api/ai/plan", request, PlanResponseSchema, (force) => user.getIdToken(force));
    if (!result.ok) {
      const { error } = result;
      const until = Date.now() + (error.retryAfterSeconds ?? 0) * 1000;
      setState(
        error.code === "DAILY_LIMIT_REACHED"
          ? { kind: "daily-limit", message: error.message, until }
          : { kind: "error", error, retryAt: error.retryAfterSeconds ? until : null },
      );
      return;
    }
    // Defence in depth: the same rules the server ran, before anything is saved.
    if (planRuleFailures(result.data, request).length > 0) {
      setState({ kind: "error", error: { code: "AI_INVALID_OUTPUT", message: "The AI's answer didn't pass our checks, so it wasn't used. Please try again.", retryable: true, retryAfterSeconds: null }, retryAt: null });
      return;
    }
    try {
      await repository.saveEvent(applyGeneratedPlan(plan, result.data, () => crypto.randomUUID()), plan.version);
      // The live subscription swaps this card for the plan.
    } catch (error) {
      setState(
        error instanceof VersionConflictError
          ? { kind: "conflict" }
          : { kind: "error", error: { code: "SAVE_FAILED", message: "The plan was generated but couldn't be saved. Check your connection and try again.", retryable: true, retryAfterSeconds: null }, retryAt: null },
      );
    }
  };

  const working = state.kind === "working";

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle render={<h2 />}>Your plan</CardTitle>
        <CardDescription>
          Budget lines with estimate ranges, and a task timeline, built from your details and answers. You can edit
          everything afterwards.
        </CardDescription>
      </CardHeader>
      <CardPanel className="flex flex-col gap-4">
        <div aria-live="polite" className="flex flex-col gap-3">
          {working && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
              Building your plan. This usually takes 10 to 40 seconds.
            </p>
          )}
          {state.kind === "error" && (
            <Alert variant="error">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>The plan couldn&apos;t be generated</AlertTitle>
              <AlertDescription>
                <p>{state.error.message}</p>
                <p>Your event is saved. Try again, or start with an empty plan and add lines yourself.</p>
              </AlertDescription>
            </Alert>
          )}
          {state.kind === "daily-limit" && (
            <Alert variant="warning">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>AI help is paused for today</AlertTitle>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}
          {state.kind === "conflict" && (
            <Alert variant="warning">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Someone else changed this event</AlertTitle>
              <AlertDescription>You&apos;re now seeing the latest version. Generate again if it still has no plan.</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {state.kind === "error" ? (
            <Button onClick={() => void generate()} disabled={waitSeconds > 0 || !state.error.retryable}>
              <RotateCw aria-hidden="true" />
              {waitSeconds > 0 ? `Retry in ${waitSeconds} s` : "Retry"}
            </Button>
          ) : (
            <Button onClick={() => void generate()} loading={working} disabled={dailyLimited}>
              <Sparkles aria-hidden="true" />
              Generate my plan
            </Button>
          )}
          {/* Spec §7.6: always available, and nothing is invented for it. */}
          <Button variant="outline" onClick={onStartEmpty} disabled={working}>
            Start with an empty plan
          </Button>
        </div>
      </CardPanel>
    </Card>
  );
}
