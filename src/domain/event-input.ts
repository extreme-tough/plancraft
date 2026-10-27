import { amountErrorMessage, parseAmount } from "./amount-parser";
import { daysBetween, isIsoDate, type IsoDate } from "./dates";
import { currencyExponent, isSupportedCurrency, type Minor } from "./money";
import { isCountryCode } from "./regions";
import {
  CATEGORIES,
  EventPlanSchema,
  type Category,
  type EventPart,
  type EventPlan,
  type OnboardingAnswers,
} from "./schemas";

/**
 * The event form (EM-01, EM-02) as the user types it, and the rules that turn it into a stored
 * event. Everything here is pure: "today" and ids come in as arguments (EM-55).
 */

export type UseCase = EventPlan["useCase"];
export type EventType = EventPlan["eventType"];
export type AgeGroup = OnboardingAnswers["ageGroups"][number];
export type Experience = NonNullable<OnboardingAnswers["experience"]>;

export const USE_CASES: readonly UseCase[] = ["small_celebration", "wedding", "community"];
export const EVENT_TYPES: readonly EventType[] = [
  "birthday",
  "milestone_birthday",
  "anniversary",
  "wedding",
  "community_gathering",
  "other",
];
export const AGE_GROUPS: readonly AgeGroup[] = ["children", "teens", "adults", "seniors"];
export const EXPERIENCE_LEVELS: readonly Experience[] = ["first_time", "some", "experienced"];
/** Spending priorities offered in the question form. Contingency is a safety margin, not a priority. */
export const PRIORITY_CATEGORIES: readonly Category[] = CATEGORIES.filter((c) => c !== "contingency");

export const LIMITS = {
  occasion: 120,
  city: 80,
  partName: 60,
  parts: 4,
  guests: 10_000,
  priorities: 3,
  mustHaves: 5,
  mustHave: 120,
  atmosphere: 120,
  longAnswer: 300,
  description: 2000,
} as const;

export interface PartInput {
  /** Stable key for the form row; becomes the part's id. */
  id: string;
  name: string;
  guestCount: string;
}

/** Step 1, exactly as typed. Amounts and counts stay text until validated (EM-38). */
export interface EventDetailsInput {
  useCase: UseCase | "";
  eventType: EventType | "";
  occasion: string;
  city: string;
  country: string;
  eventDate: string;
  currency: string;
  budget: string;
  guestCount: string;
  parts: PartInput[];
}

/** Step 2 (EM-02). Must-haves are one per line. */
export interface AnswersInput {
  priorities: Category[];
  mustHaves: string;
  experience: Experience | "";
  atmosphere: string;
  ageGroups: AgeGroup[];
  cultural: string;
  accessibility: string;
  venueConstraints: string;
  description: string;
}

export interface EventDetails {
  useCase: UseCase;
  eventType: EventType;
  occasion: string;
  location: { city: string; country: string };
  eventDate: IsoDate;
  currency: string;
  budget: Minor;
  guestCount: number;
  parts: EventPart[];
}

/** Field name → message. Part fields are keyed `parts.<index>.name` / `parts.<index>.guestCount`. */
export type FieldErrors = Record<string, string>;

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export const DEFAULT_EVENT_TYPE: Readonly<Record<UseCase, EventType>> = {
  small_celebration: "birthday",
  wedding: "wedding",
  community: "community_gathering",
};

/** EM-05: the use case sets the question form's defaults. Everything stays editable. */
const DEFAULT_PRIORITIES: Readonly<Record<UseCase, Category[]>> = {
  small_celebration: ["catering", "decoration"],
  wedding: ["venue", "catering", "photography"],
  community: ["venue", "catering", "permits"],
};

const DEFAULT_AGE_GROUPS: Readonly<Record<UseCase, AgeGroup[]>> = {
  small_celebration: ["adults"],
  wedding: ["children", "adults", "seniors"],
  community: ["children", "teens", "adults", "seniors"],
};

export function emptyEventDetails(): EventDetailsInput {
  return {
    useCase: "",
    eventType: "",
    occasion: "",
    city: "",
    country: "",
    eventDate: "",
    currency: "",
    budget: "",
    guestCount: "",
    parts: [],
  };
}

export function defaultAnswers(useCase: UseCase): AnswersInput {
  return {
    priorities: [...DEFAULT_PRIORITIES[useCase]],
    mustHaves: "",
    experience: "",
    atmosphere: "",
    ageGroups: [...DEFAULT_AGE_GROUPS[useCase]],
    cultural: "",
    accessibility: "",
    venueConstraints: "",
    description: "",
  };
}

/** Days left to plan, shown and never entered (EM-01, A9). */
export function planningWindowDays(eventDate: IsoDate, today: IsoDate): number {
  return daysBetween(today, eventDate);
}

/** Budget per main-event guest, to the nearest whole major unit (₹5,333, not ₹5,333.33). A hint, never stored. */
export function budgetPerGuest(budget: Minor, guests: number, currency: string): Minor {
  const unit = 10 ** currencyExponent(currency);
  return Math.round(budget / guests / unit) * unit;
}

/** Picking an occasion suggests the use case, until the user picks one themselves (EM-05). */
export const USE_CASE_FOR_EVENT_TYPE: Readonly<Record<EventType, UseCase | null>> = {
  birthday: "small_celebration",
  milestone_birthday: "small_celebration",
  anniversary: "small_celebration",
  wedding: "wedding",
  community_gathering: "community",
  other: null,
};

/**
 * Quick budget picks, typed the way people say them so the field reads them back (EM-38).
 * Rough round numbers per currency magnitude; they are shortcuts, not advice.
 */
export function budgetSuggestions(currency: string): string[] {
  if (currency === "INR") return ["2 lakh", "5 lakh", "8 lakh", "15 lakh"];
  if (["JPY", "KRW", "IDR", "VND", "CLP", "COP", "HUF", "PKR", "LKR", "NGN", "UGX", "TZS"].includes(currency)) {
    return ["500k", "1m", "3m", "5m"];
  }
  return ["5k", "10k", "25k", "50k"];
}

/** "150", "1,000", "1.000", "1 000" → a whole number; anything else → null. */
export function parseGuestCount(text: string): number | null {
  const trimmed = text.normalize("NFKC").trim();
  if (!/^\d{1,3}(?:[,.\s'’]?\d{3})*$/.test(trimmed)) return null;
  return Number(trimmed.replace(/[,.\s'’]/g, ""));
}

function guestCountError(text: string): string | null {
  if (text.trim() === "") return "Enter the number of guests.";
  const count = parseGuestCount(text);
  if (count === null) return "Enter a whole number of guests.";
  if (count < 1 || count > LIMITS.guests) return `Guests must be between 1 and ${LIMITS.guests.toLocaleString("en")}.`;
  return null;
}

function textError(value: string, label: string, max: number, required: boolean): string | null {
  const trimmed = value.trim();
  if (required && trimmed === "") return `Enter ${label}.`;
  if (trimmed.length > max) return `Keep ${label} to ${max} characters or fewer.`;
  return null;
}

/** EM-01 validation. The budget is parsed with the event's currency (EM-38). */
export function validateEventDetails(
  input: EventDetailsInput,
  today: IsoDate,
  locale?: string,
): Validated<EventDetails> {
  const errors: FieldErrors = {};
  const set = (field: string, message: string | null): void => {
    if (message) errors[field] = message;
  };

  if (input.useCase === "") errors.useCase = "Choose a plan style.";
  if (input.eventType === "") errors.eventType = "Choose the occasion type.";
  set("occasion", textError(input.occasion, "the event name", LIMITS.occasion, true));
  set("city", textError(input.city, "the city", LIMITS.city, true));
  if (input.country === "") errors.country = "Choose the country.";
  else if (!isCountryCode(input.country)) errors.country = "Choose a country from the list.";

  if (input.eventDate === "") errors.eventDate = "Enter the event date.";
  else if (!isIsoDate(input.eventDate)) errors.eventDate = "Enter a real date.";
  else if (planningWindowDays(input.eventDate, today) <= 0) errors.eventDate = "The event date must be after today.";

  const currencyOk = isSupportedCurrency(input.currency);
  if (input.currency === "") errors.currency = "Choose the currency.";
  else if (!currencyOk) errors.currency = "Choose a currency from the list.";

  let budget: Minor = 0;
  if (input.budget.trim() === "") {
    errors.budget = "Enter the total budget.";
  } else if (currencyOk) {
    const parsed = parseAmount(input.budget, input.currency, locale);
    if (parsed.kind === "error") errors.budget = amountErrorMessage(parsed, input.currency);
    else if (parsed.minor <= 0) errors.budget = "The budget must be more than zero.";
    else budget = parsed.minor;
  } else {
    errors.budget = "Choose the currency first, so the budget can be read.";
  }

  set("guestCount", guestCountError(input.guestCount));

  if (input.parts.length > LIMITS.parts) errors.parts = `Add at most ${LIMITS.parts} extra parts.`;
  input.parts.forEach((part, index) => {
    set(`parts.${index}.name`, textError(part.name, "the part's name", LIMITS.partName, true));
    set(`parts.${index}.guestCount`, guestCountError(part.guestCount));
  });

  if (Object.keys(errors).length > 0 || input.useCase === "" || input.eventType === "") {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      useCase: input.useCase,
      eventType: input.eventType,
      occasion: input.occasion.trim(),
      location: { city: input.city.trim(), country: input.country },
      eventDate: input.eventDate,
      currency: input.currency,
      budget,
      guestCount: parseGuestCount(input.guestCount) ?? 0,
      parts: input.parts.map((part) => ({
        id: part.id,
        name: part.name.trim(),
        guestCount: parseGuestCount(part.guestCount) ?? 0,
      })),
    },
  };
}

/** Must-haves textarea → up to five non-empty lines. */
export function splitMustHaves(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export interface AnswersWithDescription {
  answers: OnboardingAnswers;
  description: string;
}

/** EM-02: only the priorities are required (1–3). */
export function validateAnswers(input: AnswersInput): Validated<AnswersWithDescription> {
  const errors: FieldErrors = {};
  const set = (field: string, message: string | null): void => {
    if (message) errors[field] = message;
  };

  if (input.priorities.length === 0) errors.priorities = "Pick at least one spending priority.";
  else if (input.priorities.length > LIMITS.priorities) errors.priorities = `Pick at most ${LIMITS.priorities} priorities.`;

  const mustHaves = splitMustHaves(input.mustHaves);
  if (mustHaves.length > LIMITS.mustHaves) errors.mustHaves = `List at most ${LIMITS.mustHaves} must-haves, one per line.`;
  else if (mustHaves.some((m) => m.length > LIMITS.mustHave)) {
    errors.mustHaves = `Keep each must-have to ${LIMITS.mustHave} characters or fewer.`;
  }

  set("atmosphere", textError(input.atmosphere, "the atmosphere", LIMITS.atmosphere, false));
  set("cultural", textError(input.cultural, "this answer", LIMITS.longAnswer, false));
  set("accessibility", textError(input.accessibility, "this answer", LIMITS.longAnswer, false));
  set("venueConstraints", textError(input.venueConstraints, "this answer", LIMITS.longAnswer, false));
  set("description", textError(input.description, "this note", LIMITS.description, false));

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      answers: {
        priorities: [...new Set(input.priorities)],
        mustHaves,
        experience: input.experience === "" ? null : input.experience,
        atmosphere: input.atmosphere.trim(),
        ageGroups: AGE_GROUPS.filter((group) => input.ageGroups.includes(group)),
        cultural: input.cultural.trim(),
        accessibility: input.accessibility.trim(),
        venueConstraints: input.venueConstraints.trim(),
      },
      description: input.description.trim(),
    },
  };
}

/**
 * A new event with no plan yet, at version 0 (EM-01, EM-02). Lines and tasks arrive with the
 * generated plan (EM-03). Throws if the result breaks the stored schema, which validation prevents.
 */
export function createEventPlan(args: {
  id: string;
  details: EventDetails;
  answers: AnswersWithDescription;
  isDemo: boolean;
}): EventPlan {
  return EventPlanSchema.parse({
    schemaVersion: 1,
    id: args.id,
    version: 0,
    isDemo: args.isDemo,
    demoPinned: false,
    ...args.details,
    answers: args.answers.answers,
    description: args.answers.description,
    lines: [],
    tasks: [],
    assumptions: [],
    openQuestions: [],
    teamNotes: "",
    dismissedAlerts: [],
  });
}
