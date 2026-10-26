import type { BudgetLine, EventPlan, Task } from "@/domain/schemas";

/** Small, valid building blocks for tests. Override only what a test cares about. */

export function makeLine(overrides: Partial<BudgetLine> & Pick<BudgetLine, "id">): BudgetLine {
  return {
    category: "other",
    name: `Line ${overrides.id}`,
    partId: null,
    pricing: "flat",
    guestSource: null,
    ownGuests: null,
    unitCost: null,
    amount: 0,
    label: "ai_estimate",
    quoteId: null,
    estimate: null,
    assumptions: [],
    vendorNeeds: [],
    vendorQuestions: [],
    payment: null,
    ...overrides,
  };
}

export function makeTask(overrides: Partial<Task> & Pick<Task, "id">): Task {
  return {
    title: `Task ${overrides.id}`,
    lineId: null,
    priority: "medium",
    leadTimeDays: 30,
    durationDays: 7,
    dependsOn: [],
    status: "not_started",
    ...overrides,
  };
}

export function makePlan(overrides: Partial<EventPlan> = {}): EventPlan {
  return {
    schemaVersion: 1,
    id: "event-1",
    version: 0,
    isDemo: false,
    demoPinned: false,
    useCase: "wedding",
    eventType: "wedding",
    occasion: "Ananya & Rohan's wedding",
    location: { city: "Jaipur", country: "IN" },
    eventDate: "2027-02-21",
    currency: "INR",
    budget: 80_000_000, // ₹8,00,000.00
    guestCount: 150,
    parts: [],
    answers: {
      priorities: ["catering"],
      mustHaves: [],
      experience: null,
      atmosphere: "",
      ageGroups: [],
      cultural: "",
      accessibility: "",
      venueConstraints: "",
    },
    description: "",
    lines: [],
    tasks: [],
    assumptions: [],
    openQuestions: [],
    teamNotes: "",
    dismissedAlerts: [],
    ...overrides,
  };
}

/**
 * The spec §12 scenario: ₹8 lakh, 150 guests, 120 days out, a confirmed ₹2,50,000 venue, per-guest
 * catering following the event count, and the chain Book venue → Book caterer → Menu tasting.
 */
export function finalTestPlan(today: string): EventPlan {
  const eventDate = addDaysIso(today, 120);
  return makePlan({
    eventDate,
    lines: [
      makeLine({ id: "venue", category: "venue", name: "Venue", amount: 25_000_000, label: "confirmed" }),
      makeLine({
        id: "catering",
        category: "catering",
        name: "Catering",
        pricing: "per_guest",
        guestSource: "event",
        unitCost: 200_000, // ₹2,000 a plate
        amount: 200_000 * 150,
      }),
      makeLine({ id: "decor", category: "decoration", name: "Decoration", amount: 12_000_000 }),
      makeLine({ id: "photo", category: "photography", name: "Photography", amount: 8_000_000 }),
      makeLine({ id: "music", category: "entertainment", name: "Live band", amount: 5_000_000 }),
    ],
    tasks: [
      makeTask({ id: "venue-task", title: "Book venue", lineId: "venue", leadTimeDays: 90, durationDays: 7, priority: "high" }),
      makeTask({ id: "caterer", title: "Book caterer", lineId: "catering", leadTimeDays: 60, durationDays: 10, dependsOn: ["venue-task"] }),
      makeTask({ id: "tasting", title: "Menu tasting", lineId: "catering", leadTimeDays: 30, durationDays: 3, dependsOn: ["caterer"] }),
    ],
  });
}

function addDaysIso(date: string, days: number): string {
  const ms = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}
