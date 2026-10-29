import { z } from "zod";
import { parseAmount } from "./amount-parser";
import { compareDates, isIsoDate, type IsoDate } from "./dates";
import {
  AGE_GROUPS,
  defaultAnswers,
  EVENT_TYPES,
  EXPERIENCE_LEVELS,
  LIMITS,
  PRIORITY_CATEGORIES,
  USE_CASE_FOR_EVENT_TYPE,
  USE_CASES,
  type AnswersInput,
  type EventDetailsInput,
  type UseCase,
} from "./event-input";
import { isSupportedCurrency } from "./money";
import { isCountryCode, suggestedCurrency } from "./regions";

/**
 * The describe call's contract (AI-13): the user's own description of the event in, proposed form
 * values out. The model only copies what the text states; code checks every value and drops what
 * isn't grounded or valid (normalizeDescribed), then fills only the form's empty fields
 * (fillFromDescription). The user reviews the form before anything is saved or calculated. Pure,
 * so server and browser share it.
 */

export const DESCRIBE_TEXT_MIN = 20;

export const DescribeRequestSchema = z.strictObject({
  text: z.string().min(DESCRIBE_TEXT_MIN).max(LIMITS.description),
  /** The device's local date (EM-55), so "26 February" resolves to the next one. */
  today: z.iso.date(),
});
export type DescribeRequest = z.infer<typeof DescribeRequestSchema>;

/** Same threshold idea as EM-48: too little text to read is never sent. */
export function describeTextProblem(text: string): string | null {
  if (text.replace(/\s/g, "").length < DESCRIBE_TEXT_MIN) return `Describe your event in at least ${DESCRIBE_TEXT_MIN} characters first.`;
  if (text.length > LIMITS.description) return `Use at most ${LIMITS.description.toLocaleString("en")} characters.`;
  return null;
}

const short = (max: number) => z.string().trim().min(1).max(max).nullable();

export const DescribeResponseSchema = z.strictObject({
  eventType: z.enum(EVENT_TYPES as [string, ...string[]]).nullable(),
  useCase: z.enum(USE_CASES as [string, ...string[]]).nullable(),
  occasion: short(LIMITS.occasion),
  city: short(LIMITS.city),
  country: z.string().regex(/^[A-Z]{2}$/).nullable(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  /** The budget exactly as written, without currency symbols ("8 lakh", "15,000"). Code parses it (EM-38). */
  budgetText: short(40),
  guestCount: z.number().int().min(1).max(LIMITS.guests).nullable(),
  parts: z
    .array(z.strictObject({ name: z.string().trim().min(1).max(LIMITS.partName), guestCount: z.number().int().min(1).max(LIMITS.guests).nullable() }))
    .max(LIMITS.parts),
  priorities: z.array(z.enum(PRIORITY_CATEGORIES as [string, ...string[]])).max(LIMITS.priorities),
  mustHaves: z.array(z.string().trim().min(1).max(LIMITS.mustHave)).max(LIMITS.mustHaves),
  experience: z.enum(EXPERIENCE_LEVELS as [string, ...string[]]).nullable(),
  atmosphere: short(LIMITS.atmosphere),
  ageGroups: z.array(z.enum(AGE_GROUPS as [string, ...string[]])).max(AGE_GROUPS.length),
  cultural: short(LIMITS.longAnswer),
  accessibility: short(LIMITS.longAnswer),
  venueConstraints: short(LIMITS.longAnswer),
});
export type DescribeResponse = z.infer<typeof DescribeResponseSchema>;

/** No rule fails the whole response: bad values are dropped one by one in normalizeDescribed. */
export const DESCRIBE_RULES: Readonly<Record<string, string>> = {};

const squash = (text: string): string => text.toLowerCase().replace(/[\s,.'’]/g, "");

/**
 * Drops every value code can't trust, so the form only ever gets checked values:
 * - a country or currency that isn't a real ISO code;
 * - a date that isn't a real calendar date after today (EM-55);
 * - a budget or guest count that doesn't appear in the user's own text (grounding, as in Q3/Q4);
 * - a budget the amount parser can't read in that currency.
 */
export function normalizeDescribed(response: DescribeResponse, request: DescribeRequest): DescribeResponse {
  const text = squash(request.text);
  const digits = request.text.replace(/[\s,.'’]/g, "");
  const grounded = (value: string): boolean => text.includes(squash(value));
  const country = response.country && isCountryCode(response.country) ? response.country : null;
  const currency = response.currency && isSupportedCurrency(response.currency) ? response.currency : null;
  const budgetCurrency = currency ?? (country ? suggestedCurrency(country) : null);
  const budgetOk =
    response.budgetText !== null &&
    grounded(response.budgetText) &&
    budgetCurrency !== null &&
    parseAmount(response.budgetText, budgetCurrency, "en").kind === "ok";
  const dateOk = response.eventDate !== null && isIsoDate(response.eventDate) && compareDates(response.eventDate, request.today as IsoDate) > 0;
  const guestsOk = (count: number | null): boolean => count !== null && digits.includes(String(count));
  return {
    ...response,
    country,
    currency,
    eventDate: dateOk ? response.eventDate : null,
    budgetText: budgetOk ? response.budgetText : null,
    guestCount: guestsOk(response.guestCount) ? response.guestCount : null,
    parts: response.parts.map((part) => ({ ...part, guestCount: guestsOk(part.guestCount) ? part.guestCount : null })),
  };
}

export interface FormInputs {
  details: EventDetailsInput;
  /** Null until the use case is known (EM-05). */
  answers: AnswersInput | null;
}

export interface Filled extends FormInputs {
  /** Names of the fields that got a value, for the status message. */
  filled: string[];
  /** Required step-1 fields still empty afterwards, in form order, so the user knows what to add. */
  missing: Array<{ field: RequiredField; label: string }>;
}

/** Step 1's required fields, in form order, with the words the status message uses. */
const REQUIRED: ReadonlyArray<readonly [RequiredField, string]> = [
  ["eventType", "occasion type"],
  ["useCase", "plan style"],
  ["occasion", "event name"],
  ["city", "city"],
  ["country", "country"],
  ["eventDate", "date"],
  ["currency", "currency"],
  ["budget", "budget"],
  ["guestCount", "guests"],
];
type RequiredField = Exclude<keyof EventDetailsInput, "parts">;

export function missingDetails(details: EventDetailsInput): Filled["missing"] {
  return REQUIRED.filter(([field]) => details[field].trim() === "").map(([field, label]) => ({ field, label }));
}

/**
 * Puts the checked values into the form, filling only fields that are still empty: anything the
 * user typed stays. The use case follows the event type when the text doesn't name one (EM-05),
 * and the currency follows the country, as when typing.
 */
export function fillFromDescription(form: FormInputs, response: DescribeResponse, makeId: () => string): Filled {
  const filled: string[] = [];
  const d = { ...form.details };
  const take = <K extends keyof EventDetailsInput>(key: K, value: EventDetailsInput[K] | null, label: string): void => {
    if (value === null || value === "" || d[key] !== "") return;
    d[key] = value;
    filled.push(label);
  };

  take("eventType", response.eventType as EventDetailsInput["eventType"] | null, "occasion type");
  const useCase = (response.useCase as UseCase | null) ?? (d.eventType ? USE_CASE_FOR_EVENT_TYPE[d.eventType] : null);
  take("useCase", useCase, "plan style");
  take("occasion", response.occasion, "event name");
  take("city", response.city, "city");
  take("country", response.country, "country");
  take("eventDate", response.eventDate, "date");
  take("currency", response.currency ?? (d.country ? suggestedCurrency(d.country) : null), "currency");
  take("budget", response.budgetText, "budget");
  take("guestCount", response.guestCount === null ? null : String(response.guestCount), "guests");
  if (d.parts.length === 0 && response.parts.length > 0) {
    d.parts = response.parts.map((part) => ({ id: makeId(), name: part.name, guestCount: part.guestCount === null ? "" : String(part.guestCount) }));
    filled.push(response.parts.length === 1 ? "1 extra part" : `${response.parts.length} extra parts`);
  }

  const base = form.answers ?? (d.useCase ? defaultAnswers(d.useCase) : null);
  if (!base) return { details: d, answers: null, filled, missing: missingDetails(d) };
  const a = { ...base };
  const text = (key: "atmosphere" | "cultural" | "accessibility" | "venueConstraints", value: string | null, label: string): void => {
    if (value === null || a[key].trim() !== "") return;
    a[key] = value;
    filled.push(label);
  };
  // Untouched priorities and age groups are only the use case's defaults, so the text's own list
  // wins; once the user has changed them (answers already set), theirs stay.
  const defaultsOnly = form.answers === null;
  if (response.priorities.length > 0 && defaultsOnly) {
    a.priorities = response.priorities as AnswersInput["priorities"];
    filled.push("priorities");
  }
  if (response.ageGroups.length > 0 && defaultsOnly) {
    a.ageGroups = response.ageGroups as AnswersInput["ageGroups"];
    filled.push("age groups");
  }
  if (response.mustHaves.length > 0 && a.mustHaves.trim() === "") {
    a.mustHaves = response.mustHaves.join("\n");
    filled.push("must-haves");
  }
  if (response.experience && a.experience === "") {
    a.experience = response.experience as AnswersInput["experience"];
    filled.push("experience");
  }
  text("atmosphere", response.atmosphere, "atmosphere");
  text("cultural", response.cultural, "cultural needs");
  text("accessibility", response.accessibility, "accessibility needs");
  text("venueConstraints", response.venueConstraints, "venue constraints");
  return { details: d, answers: a, filled, missing: missingDetails(d) };
}
