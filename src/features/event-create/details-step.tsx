"use client";

import {
  Cake,
  CalendarDays,
  Heart,
  Hourglass,
  Landmark,
  Lightbulb,
  MapPin,
  Minus,
  PartyPopper,
  Plus,
  Sparkles,
  Trash2,
  Users,
  Wallet,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { parseAmount } from "@/domain/amount-parser";
import { addDays, isIsoDate } from "@/domain/dates";
import {
  budgetPerGuest,
  budgetSuggestions,
  EVENT_TYPES,
  LIMITS,
  parseGuestCount,
  planningWindowDays,
  USE_CASES,
  type EventDetailsInput,
  type EventType,
  type PartInput,
  type UseCase,
} from "@/domain/event-input";
import { formatMoneyCompact } from "@/domain/format";
import { isSupportedCurrency } from "@/domain/money";
import { EVENT_TYPE_HINT, EVENT_TYPE_TEXT, USE_CASE_TEXT } from "@/lib/display-names";
import { cn } from "@/lib/utils";
import { AmountField } from "./amount-field";
import { describedBy, errorId, FieldErrorText, FormField } from "./form-field";
import { CountryPicker, CurrencyPicker } from "./region-pickers";

export const DETAILS_FIELD_ORDER = [
  "eventType",
  "useCase",
  "occasion",
  "city",
  "country",
  "eventDate",
  "currency",
  "budget",
  "guestCount",
] as const;

export function detailsFieldId(field: string): string {
  return `event-${field.replace(/\./g, "-")}`;
}

const EVENT_TYPE_ICON: Readonly<Record<EventType, LucideIcon>> = {
  birthday: Cake,
  milestone_birthday: PartyPopper,
  anniversary: Wine,
  wedding: Heart,
  community_gathering: Landmark,
  other: Sparkles,
};

interface Props {
  value: EventDetailsInput;
  errors: Record<string, string>;
  today: string;
  locale: string;
  onChange: (patch: Partial<EventDetailsInput>) => void;
  onEventType: (eventType: EventType) => void;
  onUseCase: (useCase: UseCase) => void;
  onCountry: (country: string) => void;
  onCurrency: (currency: string) => void;
  onBlur: (field: string) => void;
  onAddPart: () => void;
  onRemovePart: (index: number) => void;
  onPartChange: (index: number, patch: Partial<PartInput>) => void;
  description: string;
  onDescription: (description: string) => void;
}

/** A white card, as in the Figma "Event Creation" frames. */
export function FormCard({ className, children }: { className?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className={cn("flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card", className)}>
      {children}
    </section>
  );
}

function CardHeading({ id, icon: Icon, children }: { id?: string; icon?: LucideIcon; children: React.ReactNode }): React.ReactElement {
  return (
    <h3 id={id} className="flex items-center gap-2 font-semibold text-base">
      {Icon && (
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-4" />
        </span>
      )}
      {children}
    </h3>
  );
}

/** Soft callout under a field: the planning window, the per-guest budget. */
function Callout({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }): React.ReactElement {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-primary/16 bg-accent px-3 py-2.5 text-foreground text-sm">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-foreground" />
      <span>{children}</span>
    </p>
  );
}

function weeksText(days: number): string {
  const weeks = Math.floor(days / 7);
  return days >= 14 ? ` (about ${weeks} weeks)` : "";
}

/** Step 1 (EM-01, EM-04, EM-05, EM-37, EM-38, EM-55), laid out like the Figma frames 0:3 / 0:288. */
export function DetailsStep(props: Props): React.ReactElement {
  const { value, errors, today, locale, onChange, onBlur } = props;
  const id = detailsFieldId;

  const windowDays =
    isIsoDate(value.eventDate) && planningWindowDays(value.eventDate, today) > 0
      ? planningWindowDays(value.eventDate, today)
      : null;

  const guests = parseGuestCount(value.guestCount);
  const budget =
    isSupportedCurrency(value.currency) && value.budget.trim() !== ""
      ? parseAmount(value.budget, value.currency, locale)
      : null;
  const perGuest =
    budget?.kind === "ok" && budget.minor > 0 && guests !== null && guests >= 1
      ? formatMoneyCompact(budgetPerGuest(budget.minor, guests, value.currency), value.currency, locale)
      : null;

  const stepGuests = (delta: number): void => {
    const next = Math.min(LIMITS.guests, Math.max(1, (guests ?? 0) + delta));
    onChange({ guestCount: String(next) });
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <FormCard>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 id="event-type-legend" className="font-semibold">
                Occasion type
              </h3>
              <span className="text-muted-foreground text-sm">Choose one</span>
            </div>
            <RadioGroup
              id={id("eventType")}
              value={value.eventType === "" ? null : value.eventType}
              onValueChange={(next) => props.onEventType(next as EventType)}
              aria-labelledby="event-type-legend"
              aria-describedby={errors.eventType ? errorId(id("eventType")) : undefined}
              aria-invalid={errors.eventType ? true : undefined}
              className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2"
            >
              {EVENT_TYPES.map((eventType) => {
                const Icon = EVENT_TYPE_ICON[eventType];
                return (
                  <label
                    key={eventType}
                    className="group relative flex cursor-pointer items-start gap-3 rounded-xl border bg-background p-3 transition-colors hover:border-primary/40 has-data-checked:border-primary has-data-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground group-has-data-checked:bg-primary group-has-data-checked:text-primary-foreground"
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 pe-6">
                      <span className="font-semibold group-has-data-checked:text-accent-foreground">
                        {EVENT_TYPE_TEXT[eventType]}
                      </span>
                      <span className="text-muted-foreground text-sm">{EVENT_TYPE_HINT[eventType]}</span>
                    </span>
                    <Radio value={eventType} className="absolute end-3 top-3" />
                  </label>
                );
              })}
            </RadioGroup>
            <FieldErrorText id={id("eventType")} error={errors.eventType} />
          </div>

          <div className="border-t pt-4">
            <fieldset className="flex flex-col gap-2">
              <legend id="use-case-legend" className="mb-2 font-medium text-sm">
                Plan style
              </legend>
              <RadioGroup
                id={id("useCase")}
                value={value.useCase === "" ? null : value.useCase}
                onValueChange={(next) => props.onUseCase(next as UseCase)}
                aria-labelledby="use-case-legend"
                aria-describedby={describedBy("use-case-hint", errors.useCase && errorId(id("useCase")))}
                aria-invalid={errors.useCase ? true : undefined}
                className="flex flex-row flex-wrap gap-2"
              >
                {USE_CASES.map((useCase) => (
                  <label
                    key={useCase}
                    className="flex cursor-pointer items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm transition-colors has-data-checked:border-primary has-data-checked:bg-accent has-data-checked:font-semibold has-data-checked:text-accent-foreground"
                  >
                    <Radio value={useCase} />
                    {USE_CASE_TEXT[useCase].title}
                  </label>
                ))}
              </RadioGroup>
              <p id="use-case-hint" className="text-muted-foreground text-sm">
                {value.useCase === ""
                  ? "Sets the defaults for the questions on the next step."
                  : `${USE_CASE_TEXT[value.useCase].description} Sets the defaults for the next step's questions.`}
              </p>
              <FieldErrorText id={id("useCase")} error={errors.useCase} />
            </fieldset>
          </div>
        </FormCard>

        <FormCard>
          <FormField
            id={id("occasion")}
            label="Event name"
            hint="You can change this any time."
            error={errors.occasion}
            labelClassName="font-semibold text-base"
          >
            {(aria) => (
              <Input
                {...aria}
                size="lg"
                value={value.occasion}
                maxLength={LIMITS.occasion}
                placeholder="For example: Ananya & Rohan's wedding"
                onChange={(e) => onChange({ occasion: e.target.value })}
                onBlur={() => onBlur("occasion")}
              />
            )}
          </FormField>
        </FormCard>

        {/* Free text for the plan call (EM-03, EM-07): sent to the AI as written, never parsed into the fields below. */}
        <FormCard>
          <FormField
            id={id("description")}
            label="Describe your event in your own words"
            hint="The vibe, traditions, must-haves, anything unusual. The AI plans from this together with the details below."
            optional
            labelClassName="font-semibold text-base"
          >
            {(aria) => (
              <Textarea
                {...aria}
                value={props.description}
                maxLength={LIMITS.description}
                rows={4}
                placeholder="For example: A colourful outdoor wedding with a Mehendi evening the night before. Mostly vegetarian food, a few elderly relatives who need step-free access, and we'd love live folk music."
                onChange={(e) => props.onDescription(e.target.value)}
              />
            )}
          </FormField>
        </FormCard>

        <FormCard>
          <CardHeading icon={MapPin}>Location</CardHeading>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
            <FormField id={id("city")} label="City" error={errors.city}>
              {(aria) => (
                <Input
                  {...aria}
                  size="lg"
                  value={value.city}
                  maxLength={LIMITS.city}
                  autoComplete="address-level2"
                  placeholder="For example: Jaipur"
                  onChange={(e) => onChange({ city: e.target.value })}
                  onBlur={() => onBlur("city")}
                />
              )}
            </FormField>
            <FormField id={id("country")} label="Country" error={errors.country}>
              {(aria) => (
                <CountryPicker aria={aria} value={value.country} onChange={props.onCountry} onBlur={() => onBlur("country")} />
              )}
            </FormField>
          </div>
        </FormCard>

        <FormCard>
          <FormField
            id={id("eventDate")}
            label="Event date"
            hint="Task deadlines in your plan count back from this date."
            error={errors.eventDate}
            labelClassName="font-semibold text-base"
          >
            {(aria) => (
              <div className="relative w-full sm:max-w-64">
                <CalendarDays
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 start-3 z-10 my-auto size-4 text-muted-foreground"
                />
                <Input
                  {...aria}
                  type="date"
                  size="lg"
                  min={addDays(today, 1)}
                  value={value.eventDate}
                  onChange={(e) => onChange({ eventDate: e.target.value })}
                  onBlur={() => onBlur("eventDate")}
                  style={{ paddingInlineStart: "2.25rem" }}
                />
              </div>
            )}
          </FormField>
          <div aria-live="polite">
            {windowDays !== null && (
              <Callout icon={Hourglass}>
                Planning window:{" "}
                <strong className="font-semibold text-accent-foreground">
                  {windowDays === 1 ? "1 day to plan" : `${windowDays.toLocaleString(locale)} days to plan`}
                </strong>
                {weeksText(windowDays)}
              </Callout>
            )}
          </div>
        </FormCard>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <FormCard>
          <div className="flex items-center justify-between gap-3">
            <CardHeading icon={Wallet}>Budget</CardHeading>
            <div className="flex w-28 flex-col">
              {/* Visible label kept short to fit the card header, as in Figma. */}
              <label htmlFor={id("currency")} className="sr-only">
                Currency
              </label>
              <CurrencyPicker
                aria={{
                  id: id("currency"),
                  "aria-describedby": errors.currency ? errorId(id("currency")) : undefined,
                  ...(errors.currency ? { "aria-invalid": true as const } : {}),
                }}
                value={value.currency}
                onChange={props.onCurrency}
                onBlur={() => onBlur("currency")}
              />
            </div>
          </div>
          <FieldErrorText id={id("currency")} error={errors.currency} />
          <FormField id={id("budget")} label="Total budget" error={errors.budget}>
            {(aria) => (
              <AmountField
                aria={aria}
                value={value.budget}
                currency={value.currency}
                locale={locale}
                suggestions={budgetSuggestions(value.currency)}
                onChange={(next) => onChange({ budget: next })}
                onBlur={() => onBlur("budget")}
              />
            )}
          </FormField>
        </FormCard>

        <FormCard>
          <CardHeading icon={Users}>Guests</CardHeading>
          <FormField id={id("guestCount")} label="Expected guests" hint="Up to 10,000." error={errors.guestCount}>
            {(aria) => (
              <div className="flex w-full items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Fewer guests"
                  onClick={() => stepGuests(-1)}
                  disabled={guests !== null && guests <= 1}
                >
                  <Minus aria-hidden="true" />
                </Button>
                <Input
                  {...aria}
                  inputMode="numeric"
                  size="lg"
                  value={value.guestCount}
                  onChange={(e) => onChange({ guestCount: e.target.value })}
                  onBlur={() => onBlur("guestCount")}
                  className="w-24 text-center"
                />
                <span className="text-muted-foreground text-sm">attendees</span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="More guests"
                  className="ms-auto"
                  onClick={() => stepGuests(1)}
                  disabled={guests !== null && guests >= LIMITS.guests}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </div>
            )}
          </FormField>
          <div aria-live="polite">
            {perGuest && <Callout icon={Wallet}>About {perGuest} per guest.</Callout>}
          </div>

          {value.parts.length > 0 && (
            <ol className="flex flex-col gap-3" aria-label="Extra event parts">
              {value.parts.map((part, index) => (
                <li key={part.id} className="flex flex-col gap-3 rounded-xl border bg-background p-3">
                  <FormField id={id(`parts.${index}.name`)} label={`Part ${index + 1} name`} error={errors[`parts.${index}.name`]}>
                    {(aria) => (
                      <Input
                        {...aria}
                        value={part.name}
                        maxLength={LIMITS.partName}
                        placeholder="For example: Mehendi evening"
                        onChange={(e) => props.onPartChange(index, { name: e.target.value })}
                      />
                    )}
                  </FormField>
                  <div className="flex items-end gap-2">
                    <FormField
                      id={id(`parts.${index}.guestCount`)}
                      label={`Part ${index + 1} guests`}
                      error={errors[`parts.${index}.guestCount`]}
                      className="flex-1"
                    >
                      {(aria) => (
                        <Input
                          {...aria}
                          inputMode="numeric"
                          value={part.guestCount}
                          onChange={(e) => props.onPartChange(index, { guestCount: e.target.value })}
                        />
                      )}
                    </FormField>
                    <Button
                      variant="ghost"
                      onClick={() => props.onRemovePart(index)}
                      aria-label={`Remove part ${index + 1}${part.name.trim() ? `: ${part.name.trim()}` : ""}`}
                    >
                      <Trash2 aria-hidden="true" />
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {value.parts.length < LIMITS.parts && (
            <div className="flex flex-col gap-1 border-t pt-3">
              <Button variant="link" className="self-start px-0 text-accent-foreground" onClick={props.onAddPart}>
                <Plus aria-hidden="true" />
                Add another part
              </Button>
              <p className="text-muted-foreground text-sm">
                A mehendi, rehearsal dinner or after-party with its own guest count. Up to {LIMITS.parts}.
              </p>
            </div>
          )}
        </FormCard>

        <aside className="flex gap-3 rounded-2xl border bg-card/80 p-4 text-sm shadow-card">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-info text-white">
            <Lightbulb className="size-4" />
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold">Why we ask this</h3>
            <p className="text-muted-foreground">
              Your city, date and budget shape the cost ranges and task lead times in your plan. Every amount is split
              from your own budget, and you can edit all of it.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

