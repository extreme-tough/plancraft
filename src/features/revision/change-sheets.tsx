"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { amountErrorMessage, parseAmount } from "@/domain/amount-parser";
import { addDays } from "@/domain/dates";
import { parseGuestCount } from "@/domain/event-input";
import { minorToMajor } from "@/domain/money";
import type { ChangeInput } from "@/domain/revision";
import type { EventPlan } from "@/domain/schemas";
import { useSignedIn } from "@/features/auth/auth-provider";
import { AmountField } from "@/features/event-create/amount-field";
import { FormField } from "@/features/event-create/form-field";
import { startRevision } from "./start-revision";

function useStart(plan: EventPlan, today: string) {
  const { repository } = useSignedIn();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async (changes: ChangeInput[], requestText: string | null): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const id = await startRevision(repository, plan, today, changes, requestText);
      router.push(`/events/${plan.id}/revise?proposal=${id}`);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "The revision couldn't be started. Please try again.");
    }
  };
  return { busy, error, start };
}

/**
 * EM-27: "Change budget, date or guests". Submitting creates a revision; nothing in the plan
 * changes until it is applied on the before/after screen (EM-53).
 */
export function ConstraintSheet({
  plan,
  today,
  locale,
  open,
  onOpenChange,
}: {
  plan: EventPlan;
  today: string;
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const [budget, setBudget] = useState(String(minorToMajor(plan.budget, plan.currency)));
  const [date, setDate] = useState(plan.eventDate);
  const [guests, setGuests] = useState(String(plan.guestCount));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, error, start } = useStart(plan, today);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const next: Record<string, string> = {};
    const changes: ChangeInput[] = [];

    const parsed = parseAmount(budget, plan.currency, locale);
    if (parsed.kind === "error") next.budget = amountErrorMessage(parsed, plan.currency);
    else if (parsed.minor <= 0) next.budget = "The budget must be more than zero.";
    else if (parsed.minor !== plan.budget) changes.push({ field: "budget", after: String(parsed.minor) });

    if (date <= today) next.date = "The event date must be after today.";
    else if (date !== plan.eventDate) changes.push({ field: "date", after: date });

    const count = parseGuestCount(guests);
    if (count === null || count < 1 || count > 10_000) next.guests = "Enter a whole number of guests between 1 and 10,000.";
    else if (count !== plan.guestCount) changes.push({ field: "guests", after: String(count) });

    if (Object.keys(next).length === 0 && changes.length === 0) next.form = "Change at least one value.";
    setErrors(next);
    if (Object.keys(next).length === 0) void start(changes, null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup>
        <form onSubmit={submit} className="flex h-full min-h-0 flex-col" noValidate>
          <SheetHeader>
            <SheetTitle className="pe-8">Change budget, date or guests</SheetTitle>
            <SheetDescription>You&apos;ll see the effect on every line and task before anything changes.</SheetDescription>
          </SheetHeader>
          <SheetPanel className="flex flex-col gap-5">
            <FormField id="change-budget" label="Total budget" error={errors.budget}>
              {(aria) => <AmountField aria={aria} value={budget} currency={plan.currency} locale={locale} suggestions={[]} onChange={setBudget} />}
            </FormField>
            <FormField id="change-date" label="Event date" error={errors.date}>
              {(aria) => <Input {...aria} type="date" min={addDays(today, 1)} value={date} onChange={(e) => setDate(e.target.value)} className="max-w-56" />}
            </FormField>
            <FormField id="change-guests" label="Guests" error={errors.guests}>
              {(aria) => <Input {...aria} inputMode="numeric" value={guests} onChange={(e) => setGuests(e.target.value)} className="max-w-32" />}
            </FormField>
            <div aria-live="polite">
              {(errors.form || error) && (
                <Alert variant="error">
                  <AlertDescription>{errors.form ?? error}</AlertDescription>
                </Alert>
              )}
            </div>
          </SheetPanel>
          <SheetFooter className="flex-row justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              See the effect
            </Button>
          </SheetFooter>
        </form>
      </SheetPopup>
    </Sheet>
  );
}

/** EM-08: "Ask for a change", free text up to 500 characters, answered by the revision call. */
export function AskSheet({
  plan,
  today,
  open,
  onOpenChange,
}: {
  plan: EventPlan;
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const { busy, error, start } = useStart(plan, today);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (text.trim() === "") return setFieldError("Describe the change you want.");
    setFieldError(null);
    void start([], text);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup>
        <form onSubmit={submit} className="flex h-full min-h-0 flex-col" noValidate>
          <SheetHeader>
            <SheetTitle className="pe-8">Ask for a change</SheetTitle>
            <SheetDescription>For example: &ldquo;The photographer is too expensive, and we&apos;d rather have a DJ than a live band.&rdquo;</SheetDescription>
          </SheetHeader>
          <SheetPanel className="flex flex-col gap-4">
            <FormField id="ask-text" label="Your request" hint={`${text.length} of 500 characters.`} error={fieldError}>
              {(aria) => <Textarea {...aria} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />}
            </FormField>
            <div aria-live="polite">
              {error && (
                <Alert variant="error">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </SheetPanel>
          <SheetFooter className="flex-row justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Suggest options
            </Button>
          </SheetFooter>
        </form>
      </SheetPopup>
    </Sheet>
  );
}
