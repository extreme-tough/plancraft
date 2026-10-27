import { addDays, type IsoDate } from "@/domain/dates";
import type { AnswersInput, EventDetailsInput } from "@/domain/event-input";

/**
 * Demo persona **inputs** (UX-10, AI-07): what a person would type into the event form. No plan,
 * amounts or AI output live here. "Try an example" fills the form with these, and the nightly demo
 * reset (EM-63) runs the same inputs through the same validation before generating a live plan.
 */
export interface ExampleInputs {
  key: "jaipur-wedding" | "austin-birthday";
  /** Button text for "Try an example". */
  title: string;
  details: EventDetailsInput;
  answers: AnswersInput;
}

/** The primary persona (A23): an Indian family planning a wedding, ₹8 lakh, 150 guests, ~4 months out. */
export function jaipurWedding(today: IsoDate): ExampleInputs {
  return {
    key: "jaipur-wedding",
    title: "Jaipur wedding, ₹8 lakh",
    details: {
      useCase: "wedding",
      eventType: "wedding",
      occasion: "Ananya & Rohan's wedding",
      city: "Jaipur",
      country: "IN",
      eventDate: addDays(today, 120),
      currency: "INR",
      budget: "8 lakh",
      guestCount: "150",
      parts: [{ id: "demo-part-mehendi", name: "Mehendi evening", guestCount: "60" }],
    },
    answers: {
      priorities: ["venue", "catering", "photography"],
      mustHaves: "Vegetarian Rajasthani thali for dinner\nPhotographer for both days",
      experience: "first_time",
      atmosphere: "Colourful and traditional, relaxed for older relatives",
      ageGroups: ["children", "adults", "seniors"],
      cultural: "Hindu ceremony with a pandit. Vegetarian food only, no alcohol.",
      accessibility: "Two grandparents need step-free access and seating near the mandap.",
      venueConstraints: "Garden venue preferred, with an indoor fallback in case of rain.",
      description: "Family wedding with relatives travelling from Delhi and Mumbai.",
    },
  };
}

/** Demo D1's second persona: a US 50th birthday with a guest who uses a wheelchair. */
export function austinBirthday(today: IsoDate): ExampleInputs {
  return {
    key: "austin-birthday",
    title: "Austin 50th birthday, $15,000",
    details: {
      useCase: "small_celebration",
      eventType: "milestone_birthday",
      occasion: "Maya's 50th birthday",
      city: "Austin",
      country: "US",
      eventDate: addDays(today, 75),
      currency: "USD",
      budget: "15k",
      guestCount: "60",
      parts: [],
    },
    answers: {
      priorities: ["venue", "catering", "entertainment"],
      mustHaves: "Live music\nA toast slideshow",
      experience: "some",
      atmosphere: "Relaxed backyard party that turns into dancing",
      ageGroups: ["adults", "seniors"],
      cultural: "",
      accessibility: "One guest uses a wheelchair: step-free entrance and an accessible restroom.",
      venueConstraints: "Indoor space needed in case of summer heat.",
      description: "",
    },
  };
}

export const EXAMPLES: ReadonlyArray<(today: IsoDate) => ExampleInputs> = [jaipurWedding, austinBirthday];
