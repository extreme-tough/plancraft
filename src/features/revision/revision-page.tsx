"use client";

import { ArrowLeft, Check, CircleAlert, RotateCw, ShieldCheck, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { VersionConflictError } from "@/data/repository";
import { summarizeBudget } from "@/domain/budget";
import { parseAmount } from "@/domain/amount-parser";
import { diffPlans } from "@/domain/diff";
import { DomainError } from "@/domain/errors";
import { formatDate, formatMoneyWhole } from "@/domain/format";
import { applyOps, applyProposal, assertConfirmedUnchanged, isStale, type Proposal, type ProposalOption } from "@/domain/proposal";
import { constraintChanges, type ChangeInput } from "@/domain/revision";
import { optionsFromResponse, RevisionResponseSchema, type RevisionResponse } from "@/domain/revision-contract";
import type { EventPlan } from "@/domain/schemas";
import { useSignedIn } from "@/features/auth/auth-provider";
import { callAi, type AiError } from "@/lib/ai-client";
import { useLocale } from "@/lib/locale";
import { localToday } from "@/lib/today";
import { BudgetImpact, LineImpact, TaskImpact } from "./revision-diff";
import { startRevision } from "./start-revision";

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;

type Ai = { state: "idle" } | { state: "working" } | { state: "error"; error: AiError };

function changeText(plan: EventPlan, field: Proposal["changes"][number]["field"], value: string, locale: string): string {
  if (field === "budget") return formatMoneyWhole(Number(value), plan.currency, locale);
  if (field === "date") return formatDate(value, locale);
  return `${Number(value).toLocaleString(locale)} guests`;
}

/** The before/after screen (UX-08, EM-52 to EM-56; Figma "Revision / Before-After"). */
export function RevisionPage({ eventId, proposalId }: { eventId: string; proposalId: string | null }): React.ReactElement {
  const { repository, user } = useSignedIn();
  const router = useRouter();
  const locale = useLocale();
  const [today] = useState(localToday);
  const [plan, setPlan] = useState<EventPlan | null | undefined>(undefined);
  const [proposal, setProposal] = useState<Proposal | null | undefined>(undefined);
  const [ai, setAi] = useState<Ai>({ state: "idle" });
  const [constraintSuggestions, setConstraintSuggestions] = useState<RevisionResponse["constraintChanges"]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const fetched = useRef(false);

  useEffect(() => repository.subscribeEvent(eventId, setPlan, () => setPlan(null)), [repository, eventId]);
  useEffect(() => {
    if (!proposalId) return setProposal(null);
    repository.getProposal(eventId, proposalId).then(setProposal, () => setProposal(null));
  }, [repository, eventId, proposalId]);

  const stale = !!plan && !!proposal && isStale(proposal, plan);

  // The code-built part of the revision (EM-17, EM-46): always available, AI or not.
  const deterministic = useMemo(() => {
    if (!plan || !proposal) return null;
    try {
      return applyOps(plan, proposal.deterministicOps);
    } catch {
      return null;
    }
  }, [plan, proposal]);

  /** Each option's effect, calculated by code on a copy (EM-54); options that break a rule are left out. */
  const options = useMemo(() => {
    if (!deterministic || !proposal || !plan) return [];
    return proposal.options.flatMap((option) => {
      try {
        const result = applyOps(deterministic, option.ops);
        assertConfirmedUnchanged(plan, result);
        return [{ option, result }];
      } catch {
        return [];
      }
    });
  }, [deterministic, proposal, plan]);

  const selected = options.find((o) => o.option.key === proposal?.selectedOption) ?? null;
  const preview = selected?.result ?? deterministic;
  const diff = plan && preview ? diffPlans(plan, preview, today) : null;
  const needsAi = !!proposal && !!deterministic && (proposal.requestText !== null || summarizeBudget(deterministic).shortfall > 0);

  const saveProposal = useCallback(
    async (next: Proposal): Promise<void> => {
      setProposal(next);
      await repository.saveProposal(next);
    },
    [repository],
  );

  const fetchOptions = useCallback(async (): Promise<void> => {
    if (!plan || !proposal || !deterministic) return;
    setAi({ state: "working" });
    setConstraintSuggestions([]);
    const result = await callAi(
      "/api/ai/revise",
      {
        eventId,
        baseVersion: proposal.baseVersion,
        today,
        changes: proposal.changes.map(({ field, after }) => ({ field, after })),
        requestText: proposal.requestText,
      },
      RevisionResponseSchema,
      (force) => user.getIdToken(force),
    );
    if (!result.ok) return setAi({ state: "error", error: result.error });
    // The response's references were built from this same deterministic plan (§7.2.5).
    const mapped: ProposalOption[] = optionsFromResponse(result.data, deterministic, () => crypto.randomUUID());
    setConstraintSuggestions(result.data.constraintChanges);
    setAi({ state: "idle" });
    await saveProposal({ ...proposal, options: mapped, interpretation: result.data.interpretation, assumptions: result.data.assumptions, selectedOption: null });
  }, [plan, proposal, deterministic, eventId, today, user, saveProposal]);

  // Fetch trade-offs once, when they're needed and not already stored with the proposal (EM-52).
  useEffect(() => {
    if (fetched.current || !needsAi || stale || !proposal || proposal.options.length > 0) return;
    fetched.current = true;
    void fetchOptions();
  }, [needsAi, stale, proposal, fetchOptions]);

  const recalculate = async (): Promise<void> => {
    if (!plan || !proposal) return;
    const changes: ChangeInput[] = proposal.changes.map(({ field, after }) => ({ field, after }));
    fetched.current = false;
    await saveProposal({ ...proposal, baseVersion: plan.version, changes: constraintChanges(plan, changes), options: [], selectedOption: null, interpretation: null, assumptions: [] });
    setMessage(null);
  };

  const apply = async (): Promise<void> => {
    if (!plan || !proposal) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = applyProposal(plan, proposal); // EM-53, EM-56, INV-10: all or nothing
      await repository.saveEvent(next, plan.version);
      await repository.deleteProposal(eventId, proposal.id);
      router.push(`/events/${eventId}`);
    } catch (error) {
      setBusy(false);
      if (error instanceof VersionConflictError || (error instanceof DomainError && error.code === "stale_proposal")) {
        setMessage("The plan changed since this proposal. Recalculate?");
      } else {
        setMessage(error instanceof DomainError ? `Nothing was changed: ${error.message}` : "Nothing was changed: the plan couldn't be saved. Please try again.");
      }
    }
  };

  const discard = async (): Promise<void> => {
    if (!proposal) return;
    setBusy(true);
    await repository.deleteProposal(eventId, proposal.id).catch(() => undefined);
    router.push(`/events/${eventId}`);
  };

  const adoptSuggestedValues = async (): Promise<void> => {
    if (!plan || !proposal) return;
    // R8 already checked that each value parses; budget amounts go to minor units here (EM-38).
    const changes: ChangeInput[] = constraintSuggestions.flatMap((c): ChangeInput[] => {
      if (c.field !== "budget") return [{ field: c.field, after: c.value }];
      const parsed = parseAmount(c.value, plan.currency, locale);
      return parsed.kind === "ok" ? [{ field: "budget", after: String(parsed.minor) }] : [];
    });
    if (changes.length === 0) return;
    const id = await startRevision(repository, plan, today, changes, proposal.requestText);
    router.replace(`/events/${eventId}/revise?proposal=${id}`);
  };

  if (plan === undefined || proposal === undefined) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground" role="status">
        <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
        Loading the revision…
      </p>
    );
  }
  if (!plan || !proposal) {
    return (
      <Alert variant="info">
        <AlertTitle>No pending revision</AlertTitle>
        <AlertDescription>
          <p>It was applied or discarded.</p>
          <Link href={`/events/${eventId}`} className="text-accent-foreground underline">
            Back to the plan
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  const money = (minor: number): string => formatMoneyWhole(minor, plan.currency, locale);
  const baseShortfall = deterministic ? summarizeBudget(deterministic).shortfall : 0;

  return (
    <div className="flex flex-col gap-6 pb-28">
      <header className="flex flex-col gap-3">
        <Link href={`/events/${eventId}`} className="inline-flex items-center gap-1 self-start rounded-md text-accent-foreground text-sm underline-offset-4 hover:underline">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to the plan
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-bold text-2xl sm:text-3xl">Proposed revision</h1>
          <Badge variant="outline">Not applied</Badge>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="What changed">
          {proposal.changes.map((change) => (
            <li key={change.field}>
              <Badge variant="info" size="lg" className="text-info-foreground">
                {change.field === "budget" ? "Budget" : change.field === "date" ? "Date" : "Guests"}: {changeText(plan, change.field, change.before, locale)} → {changeText(plan, change.field, change.after, locale)}
              </Badge>
            </li>
          ))}
          {proposal.requestText && (
            <li>
              <Badge variant="outline" size="lg" className="h-auto max-w-full justify-start whitespace-normal py-0.5 text-start sm:h-auto">
                Your request: &ldquo;{proposal.requestText}&rdquo;
              </Badge>
            </li>
          )}
        </ul>
        {/* EM-53: nothing changes until Apply. */}
        <Alert variant="success">
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Nothing has changed yet</AlertTitle>
          <AlertDescription>Review the effect below, then apply or discard it.</AlertDescription>
        </Alert>
      </header>

      <div aria-live="polite">
        {(stale || message) && (
          <Alert variant="warning">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>{stale ? "The plan changed since this proposal. Recalculate?" : message}</AlertTitle>
            {stale && (
              <AlertDescription>
                <Button className="mt-2" size="sm" onClick={() => void recalculate()}>
                  <RotateCw aria-hidden="true" />
                  Recalculate
                </Button>
              </AlertDescription>
            )}
          </Alert>
        )}
      </div>

      {!deterministic || !diff ? (
        <Alert variant="error">
          <AlertTitle>This revision can&apos;t be applied</AlertTitle>
          <AlertDescription>Its changes no longer fit the plan. Discard it and start again.</AlertDescription>
        </Alert>
      ) : (
        <>
          <BudgetImpact diff={diff} plan={plan} locale={locale} />
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <LineImpact diff={diff} plan={plan} locale={locale} />
            <TaskImpact diff={diff} locale={locale} />
          </div>

          {needsAi && (
            <section aria-labelledby="tradeoffs-heading" className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card">
              <div className="flex flex-col gap-1">
                <h2 id="tradeoffs-heading" className="flex items-center gap-2 font-bold text-lg">
                  <Sparkles aria-hidden="true" className="size-5 text-tertiary" />
                  {baseShortfall > 0 ? `You're ${money(baseShortfall)} over the new budget` : "Options for your request"}
                </h2>
                <p className="text-muted-foreground text-sm">
                  Pick one to add its changes to the preview, or none. You can also apply the change as it is and edit lines yourself.
                </p>
                {proposal.interpretation && <p className="text-sm">Understood as: {proposal.interpretation}</p>}
              </div>

              <div aria-live="polite">
                {ai.state === "working" && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
                    Finding trade-offs. This usually takes 5 to 20 seconds.
                  </p>
                )}
                {ai.state === "error" && (
                  <Alert variant="error">
                    <CircleAlert aria-hidden="true" />
                    <AlertTitle>The options couldn&apos;t be generated</AlertTitle>
                    <AlertDescription>
                      <p>{ai.error.message}</p>
                      <p>The change above still works without them: apply it and edit lines yourself.</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => void fetchOptions()} disabled={!ai.error.retryable || stale}>
                          <RotateCw aria-hidden="true" />
                          Retry
                        </Button>
                        <Button size="sm" variant="outline" render={<Link href={`/events/${eventId}`} />}>
                          Edit lines yourself
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {constraintSuggestions.length > 0 && (
                <Alert variant="info">
                  <AlertTitle>Your request mentions a new budget, date or guest count</AlertTitle>
                  <AlertDescription>
                    <p>
                      {constraintSuggestions.map((c) => `${c.field === "budget" ? "Budget" : c.field === "date" ? "Date" : "Guests"}: ${c.value}`).join(" · ")}
                    </p>
                    <p>Nothing changes until you confirm the values and apply the revision.</p>
                    <Button size="sm" className="mt-2" onClick={() => void adoptSuggestedValues()}>
                      Use these values
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {options.length > 0 && (
                <fieldset>
                  <legend className="sr-only">Trade-off options</legend>
                  <RadioGroup
                    value={proposal.selectedOption}
                    onValueChange={(key) => void saveProposal({ ...proposal, selectedOption: key as Proposal["selectedOption"] })}
                    aria-labelledby="tradeoffs-heading"
                    className="grid gap-3 md:grid-cols-2"
                    disabled={stale}
                  >
                    {options.map(({ option, result }) => {
                      const effect = summarizeBudget(result);
                      const saves = summarizeBudget(deterministic).allocated - effect.allocated;
                      const changed = diffPlans(deterministic, result, today);
                      return (
                        <label
                          key={option.key}
                          className="flex cursor-pointer items-start gap-3 rounded-xl border bg-background p-4 has-data-checked:border-primary has-data-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring"
                        >
                          <Radio value={option.key} className="mt-1" />
                          <span className="flex min-w-0 flex-col gap-1.5">
                            <span className="font-semibold">{option.title}</span>
                            {/* EM-54: every number comes from code, not from the rationale. */}
                            <span className="font-semibold text-accent-foreground text-sm">
                              {saves >= 0 ? `Saves ${money(saves)}` : `Adds ${money(-saves)}`} ·{" "}
                              {effect.shortfall > 0 ? `${money(effect.shortfall)} still short` : `Closes the gap · ${money(effect.remaining)} remaining`}
                            </span>
                            <span className="text-muted-foreground text-sm">{option.rationale}</span>
                            <span className="text-muted-foreground text-xs">
                              Changes {count(changed.lines.filter((l) => l.change !== "unchanged").length, "line")} and {count(changed.tasks.length, "task")}
                            </span>
                            {option.assumptions.length > 0 && (
                              <span className="text-muted-foreground text-xs">Assumes: {option.assumptions.join(" ")}</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </RadioGroup>
                </fieldset>
              )}
              {proposal.selectedOption && (
                <Button variant="ghost" size="sm" className="self-start" onClick={() => void saveProposal({ ...proposal, selectedOption: null })}>
                  Clear the selected option
                </Button>
              )}
            </section>
          )}
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card shadow-shell">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          {confirmDiscard ? (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm discard">
              <span className="text-sm">Discard this revision? The plan stays exactly as it is.</span>
              <Button variant="outline" onClick={() => setConfirmDiscard(false)}>
                Keep it
              </Button>
              <Button variant="destructive" onClick={() => void discard()} loading={busy}>
                <X aria-hidden="true" />
                Discard
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setConfirmDiscard(true)} disabled={busy}>
              <X aria-hidden="true" />
              Discard revision
            </Button>
          )}
          <Button size="lg" onClick={() => void apply()} disabled={stale || !deterministic || confirmDiscard} loading={busy && !confirmDiscard}>
            <Check aria-hidden="true" />
            Apply changes
          </Button>
        </div>
      </div>
    </div>
  );
}
