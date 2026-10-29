"use client";

import { ArrowLeft, ArrowRight, Check, PartyPopper, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EXAMPLES, type ExampleInputs } from "@/demo/seed";
import {
  createEventPlan,
  DEFAULT_EVENT_TYPE,
  defaultAnswers,
  emptyEventDetails,
  USE_CASE_FOR_EVENT_TYPE,
  validateAnswers,
  validateEventDetails,
  type AnswersInput,
  type EventDetailsInput,
  type EventType,
  type PartInput,
  type UseCase,
} from "@/domain/event-input";
import { suggestedCurrency } from "@/domain/regions";
import { useSignedIn } from "@/features/auth/auth-provider";
import { useLocale } from "@/lib/locale";
import { localToday } from "@/lib/today";
import { cn } from "@/lib/utils";
import { DETAILS_FIELD_ORDER, DetailsStep, detailsFieldId } from "./details-step";
import { clearDraft, loadDraft, saveDraft, type Draft } from "./draft";
import { QUESTIONS_FIELD_ORDER, QuestionsStep, questionFieldId } from "./questions-step";

const STEPS = ["Event basics", "Questions"] as const;
const NEW_EVENT_PATH = "/events/new";

const INTRO: Record<1 | 2, { title: string; text: string }> = {
  1: {
    title: "Let's plan your celebration",
    text: "Describe your event and tell us the essentials. Your budget and task plan are built from them.",
  },
  2: {
    title: "A few questions",
    text: "Only the spending priorities are required. The rest makes the plan more personal.",
  },
};

function initialDraft(): Draft {
  return (
    loadDraft() ?? {
      details: emptyEventDetails(),
      answers: null,
      answersEdited: false,
      currencyAuto: false,
      useCaseAuto: false,
      description: "",
    }
  );
}

/** Moves focus to a field, or to the first option of a radio or checkbox group. */
function focusField(id: string): void {
  const element = document.getElementById(id);
  if (!element) return;
  const option = element.matches("[role=radiogroup],[role=group]")
    ? element.querySelector<HTMLElement>("[role=radio][tabindex='0'],[role=radio],[role=checkbox]:not([data-disabled])")
    : null;
  (option ?? element).focus();
}

function firstInvalid(errors: Record<string, string>, order: readonly string[]): string | undefined {
  return order.find((field) => errors[field]) ?? Object.keys(errors)[0];
}

/** The two-step event form (Figma "Event Creation"): details, then questions, then save. */
export function EventCreateWizard(): React.ReactElement {
  const { repository, isDemo } = useSignedIn();
  const router = useRouter();
  const step = useSearchParams().get("step") === "2" ? 2 : 1;
  const locale = useLocale();
  const [today] = useState(localToday);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [attempted, setAttempted] = useState<{ 1: boolean; 2: boolean }>({ 1: false, 2: false });
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => saveDraft(draft), [draft]);

  const detailsResult = validateEventDetails(draft.details, today, locale);
  const useCase = draft.details.useCase === "" ? null : draft.details.useCase;
  const baseAnswers = draft.answers ?? (useCase ? defaultAnswers(useCase) : null);
  const answers: AnswersInput | null = baseAnswers && { ...baseAnswers, description: draft.description };
  const answersResult = answers ? validateAnswers(answers) : null;

  // Step 2 needs valid details; a stale link or a lost draft goes back to step 1.
  useEffect(() => {
    if (step === 2 && !detailsResult.ok) router.replace(NEW_EVENT_PATH);
  }, [step, detailsResult.ok, router]);

  // A new step starts at its heading, for keyboard and screen-reader users.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // Errors appear after Continue, or as soon as a field with something in it is left.
  const shownDetailsErrors = detailsResult.ok
    ? {}
    : Object.fromEntries(Object.entries(detailsResult.errors).filter(([field]) => attempted[1] || touched.has(field)));
  const shownAnswerErrors = answersResult && !answersResult.ok && attempted[2] ? answersResult.errors : {};

  const updateDetails = useCallback((patch: Partial<EventDetailsInput>) => {
    setDraft((d) => ({ ...d, details: { ...d.details, ...patch } }));
  }, []);

  const onBlur = useCallback(
    (field: string) => {
      const raw = draft.details[field as keyof EventDetailsInput];
      if (typeof raw === "string" && raw.trim() !== "") setTouched((t) => new Set(t).add(field));
    },
    [draft.details],
  );

  /** EM-05: a new use case brings its question defaults, unless the answers were already edited. */
  const withUseCase = (d: Draft, next: UseCase, auto: boolean): Draft => ({
    ...d,
    details: { ...d.details, useCase: next },
    useCaseAuto: auto,
    answers: d.answersEdited || d.details.useCase === next ? d.answers : null,
  });

  const onEventType = (eventType: EventType): void => {
    setDraft((d) => {
      const withType: Draft = { ...d, details: { ...d.details, eventType } };
      const suggestion = USE_CASE_FOR_EVENT_TYPE[eventType];
      const mayReplace = d.details.useCase === "" || d.useCaseAuto;
      return suggestion && mayReplace ? withUseCase(withType, suggestion, true) : withType;
    });
  };

  const onUseCase = (next: UseCase): void => {
    setDraft((d) => {
      const updated = withUseCase(d, next, false);
      return d.details.eventType === ""
        ? { ...updated, details: { ...updated.details, eventType: DEFAULT_EVENT_TYPE[next] } }
        : updated;
    });
  };

  const onCountry = (country: string): void => {
    setDraft((d) => {
      const suggestion = suggestedCurrency(country);
      const replace = suggestion !== null && (d.details.currency === "" || d.currencyAuto);
      return {
        ...d,
        details: { ...d.details, country, currency: replace ? suggestion : d.details.currency },
        currencyAuto: replace ? true : d.currencyAuto,
      };
    });
  };

  const onCurrency = (currency: string): void => {
    setDraft((d) => ({ ...d, details: { ...d.details, currency }, currencyAuto: false }));
  };

  const onAddPart = (): void => {
    const index = draft.details.parts.length;
    const part: PartInput = { id: crypto.randomUUID(), name: "", guestCount: "" };
    updateDetails({ parts: [...draft.details.parts, part] });
    requestAnimationFrame(() => focusField(detailsFieldId(`parts.${index}.name`)));
  };

  const onRemovePart = (index: number): void => {
    updateDetails({ parts: draft.details.parts.filter((_, i) => i !== index) });
    setStatus("Part removed.");
  };

  const onPartChange = (index: number, patch: Partial<PartInput>): void => {
    updateDetails({ parts: draft.details.parts.map((part, i) => (i === index ? { ...part, ...patch } : part)) });
  };

  const onAnswers = (patch: Partial<AnswersInput>): void => {
    if (!answers) return;
    setDraft((d) => ({ ...d, answers: { ...answers, ...patch }, answersEdited: true }));
  };

  const fillExample = (example: ExampleInputs): void => {
    setDraft({
      details: example.details,
      answers: example.answers,
      answersEdited: true,
      currencyAuto: false,
      useCaseAuto: false,
      description: example.answers.description,
    });
    setTouched(new Set());
    setAttempted({ 1: false, 2: false });
    setStatus(`Filled in the example: ${example.title}. Review it, then continue.`);
  };

  const onContinue = (): void => {
    if (!detailsResult.ok) {
      setAttempted((a) => ({ ...a, 1: true }));
      const count = Object.keys(detailsResult.errors).length;
      setStatus(count === 1 ? "1 field needs attention." : `${count} fields need attention.`);
      const field = firstInvalid(detailsResult.errors, DETAILS_FIELD_ORDER);
      if (field) requestAnimationFrame(() => focusField(detailsFieldId(field)));
      return;
    }
    setStatus("");
    router.push(`${NEW_EVENT_PATH}?step=2`);
  };

  const onSave = async (): Promise<void> => {
    if (!detailsResult.ok) return router.replace(NEW_EVENT_PATH);
    if (!answersResult?.ok) {
      setAttempted((a) => ({ ...a, 2: true }));
      setStatus("Please check the highlighted answers.");
      const field = answersResult && !answersResult.ok ? firstInvalid(answersResult.errors, QUESTIONS_FIELD_ORDER) : undefined;
      if (field) requestAnimationFrame(() => focusField(questionFieldId(field)));
      return;
    }
    setSaving(true);
    setSaveError(null);
    setStatus("Saving your event…");
    try {
      const plan = createEventPlan({
        id: crypto.randomUUID(),
        details: detailsResult.value,
        answers: answersResult.value,
        isDemo,
      });
      await repository.createEvent(plan);
      clearDraft();
      setStatus("Event saved.");
      router.push(`/events/${plan.id}`);
    } catch {
      setSaving(false);
      setStatus("");
      setSaveError("Your event couldn't be saved. Check your connection and try again. Your answers are still here.");
    }
  };

  const percent = Math.round((step / STEPS.length) * 100);

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-6 pb-28 sm:pb-6">
      <nav aria-label="Progress" className="rounded-2xl border bg-card p-4 shadow-card">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-semibold text-accent-foreground text-sm uppercase tracking-wide outline-none sm:sr-only"
        >
          Step {step} of {STEPS.length}: {STEPS[step - 1]}
        </h2>
        <ol className="hidden gap-6 sm:flex">
          {STEPS.map((label, index) => {
            const number = index + 1;
            const state = number < step ? "done" : number === step ? "current" : "next";
            return (
              <li
                key={label}
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  state === "current" ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-xs",
                    state === "next" ? "bg-secondary text-foreground" : "bg-primary text-primary-foreground",
                  )}
                >
                  {state === "done" ? <Check className="size-3.5" /> : number}
                </span>
                Step {number}: {label}
                {state === "done" && <span className="sr-only">(done)</span>}
              </li>
            );
          })}
        </ol>
        <div aria-hidden="true" className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="inline-flex items-center gap-1.5 self-start rounded-full border border-primary/24 bg-accent px-3 py-1 font-semibold text-accent-foreground text-xs uppercase tracking-wide">
            <PartyPopper aria-hidden="true" className="size-3.5" />
            New celebration setup
          </p>
          <h1 className="font-bold text-2xl sm:text-3xl">{INTRO[step].title}</h1>
          <p className="text-muted-foreground">{INTRO[step].text}</p>
        </div>

        {step === 1 && (
          <section aria-labelledby="examples-heading" className="flex shrink-0 flex-col gap-2 sm:items-end">
            <h3 id="examples-heading" className="flex items-center gap-1.5 font-semibold text-sm">
              <Sparkles aria-hidden="true" className="size-4 text-tertiary" />
              Try an example
            </h3>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {EXAMPLES.map((make) => {
                const example = make(today);
                return (
                  <Button key={example.key} variant="outline" size="sm" className="rounded-full" onClick={() => fillExample(example)}>
                    {example.title}
                  </Button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      {step === 1 && (
        <DetailsStep
          value={draft.details}
          errors={shownDetailsErrors}
          today={today}
          locale={locale}
          onChange={updateDetails}
          onEventType={onEventType}
          onUseCase={onUseCase}
          onCountry={onCountry}
          onCurrency={onCurrency}
          onBlur={onBlur}
          onAddPart={onAddPart}
          onRemovePart={onRemovePart}
          onPartChange={onPartChange}
          description={draft.description}
          onDescription={(description) => setDraft((d) => ({ ...d, description }))}
        />
      )}

      {step === 2 && useCase && answers && (
        <QuestionsStep value={answers} useCase={useCase} errors={shownAnswerErrors} onChange={onAnswers} />
      )}

      <div aria-live="polite">
        {saveError && (
          <Alert variant="error">
            <AlertTitle>Not saved</AlertTitle>
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* Mobile: pinned to the bottom (Figma 0:477). Desktop: an inline row under the cards. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card shadow-shell sm:static sm:border-0 sm:bg-transparent sm:shadow-none">
        <div className="mx-auto flex max-w-[920px] items-center gap-3 px-4 py-3 sm:px-0 sm:py-0">
          <p className="me-auto hidden items-center gap-2 text-muted-foreground text-sm sm:flex">
            <span aria-hidden="true" className="size-2 rounded-full bg-success" />
            Draft kept in this tab until you create the event
          </p>
          {step === 2 ? (
            <Button variant="outline" size="lg" onClick={() => router.push(NEW_EVENT_PATH)} disabled={saving}>
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
          ) : (
            <Button variant="outline" size="lg" render={<Link href="/" />}>
              Cancel
            </Button>
          )}
          {step === 1 ? (
            <Button size="lg" className="flex-1 sm:flex-none sm:px-6" onClick={onContinue}>
              Continue to questions
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : (
            <Button size="lg" className="flex-1 sm:flex-none sm:px-6" onClick={() => void onSave()} loading={saving}>
              <Check aria-hidden="true" />
              Create event
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
