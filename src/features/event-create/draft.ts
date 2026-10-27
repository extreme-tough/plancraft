"use client";

import { z } from "zod";
import {
  AGE_GROUPS,
  EVENT_TYPES,
  EXPERIENCE_LEVELS,
  USE_CASES,
  type AnswersInput,
  type EventDetailsInput,
} from "@/domain/event-input";
import { CategorySchema } from "@/domain/schemas";

/**
 * The half-filled event form, kept in this tab's sessionStorage so a reload or the step-2 URL
 * doesn't lose it. A per-tab convenience only: nothing here is the event until it is saved.
 */
export interface Draft {
  details: EventDetailsInput;
  /** Null until step 2 is first shown, so the use case can still set its defaults (EM-05). */
  answers: AnswersInput | null;
  /** The user (or an example) changed the answers, so a later use-case change keeps them. */
  answersEdited: boolean;
  /** The currency was filled in from the country, so picking another country may replace it. */
  currencyAuto: boolean;
  /** The use case was suggested by the occasion, so picking another occasion may replace it. */
  useCaseAuto: boolean;
}

const KEY = "plancraft:event-draft";

const text = z.string().max(5000);

const DraftSchema = z.object({
  details: z.object({
    useCase: z.enum(USE_CASES).or(z.literal("")),
    eventType: z.enum(EVENT_TYPES).or(z.literal("")),
    occasion: text,
    city: text,
    country: text,
    eventDate: text,
    currency: text,
    budget: text,
    guestCount: text,
    parts: z.array(z.object({ id: z.string().min(1).max(64), name: text, guestCount: text })).max(4),
  }),
  answers: z
    .object({
      priorities: z.array(CategorySchema).max(11),
      mustHaves: text,
      experience: z.enum(EXPERIENCE_LEVELS).or(z.literal("")),
      atmosphere: text,
      ageGroups: z.array(z.enum(AGE_GROUPS)).max(4),
      cultural: text,
      accessibility: text,
      venueConstraints: text,
      description: text,
    })
    .nullable(),
  answersEdited: z.boolean(),
  currencyAuto: z.boolean(),
  useCaseAuto: z.boolean(),
});

export function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = DraftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage can be full or blocked; the form still works without it.
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // As above.
  }
}
