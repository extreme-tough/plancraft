import type { AgeGroup, EventType, Experience, UseCase } from "@/domain/event-input";
import type { Category } from "@/domain/schemas";

/** English names for stored enum values (the UI is English only; numbers and dates follow the locale). */

export const USE_CASE_TEXT: Readonly<Record<UseCase, { title: string; description: string }>> = {
  small_celebration: {
    title: "Small celebration",
    description: "A birthday, anniversary or get-together on a tight budget.",
  },
  wedding: { title: "Wedding", description: "Many vendors, several parts, long lead times." },
  community: { title: "Community event", description: "Pooled budget, permits and an uncertain turnout." },
};

export const EVENT_TYPE_TEXT: Readonly<Record<EventType, string>> = {
  birthday: "Birthday",
  milestone_birthday: "Milestone birthday",
  anniversary: "Anniversary",
  wedding: "Wedding",
  community_gathering: "Community gathering",
  other: "Other",
};

/** One-line descriptions on the occasion cards (Figma "Occasion Type"). */
export const EVENT_TYPE_HINT: Readonly<Record<EventType, string>> = {
  birthday: "Parties for kids or grown-ups",
  milestone_birthday: "30th, 50th, 60th and beyond",
  anniversary: "Couples and milestones",
  wedding: "Ceremony and reception",
  community_gathering: "Galas, reunions, festivals",
  other: "Dinners, launches or anything custom",
};

export const CATEGORY_TEXT: Readonly<Record<Category, string>> = {
  venue: "Venue",
  catering: "Catering",
  decoration: "Decoration",
  photography: "Photography",
  entertainment: "Entertainment",
  attire: "Attire",
  invitations: "Invitations",
  transport: "Transport",
  permits: "Permits",
  contingency: "Contingency",
  other: "Other",
};

export const AGE_GROUP_TEXT: Readonly<Record<AgeGroup, string>> = {
  children: "Children",
  teens: "Teens",
  adults: "Adults",
  seniors: "Seniors",
};

export const EXPERIENCE_TEXT: Readonly<Record<Experience, string>> = {
  first_time: "First time planning something like this",
  some: "I've planned a few events",
  experienced: "I plan events often",
};

/** Country and currency names stay English, like the rest of the UI. */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames("en", { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames("en", { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}
