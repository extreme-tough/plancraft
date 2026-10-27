import { describe, expect, it } from "vitest";
import { austinBirthday, EXAMPLES, jaipurWedding } from "@/demo/seed";
import { amountErrorMessage } from "@/domain/amount-parser";
import {
  budgetPerGuest,
  budgetSuggestions,
  createEventPlan,
  USE_CASE_FOR_EVENT_TYPE,
  defaultAnswers,
  emptyEventDetails,
  parseGuestCount,
  planningWindowDays,
  splitMustHaves,
  validateAnswers,
  validateEventDetails,
  type AnswersInput,
  type EventDetailsInput,
} from "@/domain/event-input";
import { COUNTRY_CODES, isCountryCode, suggestedCurrency } from "@/domain/regions";
import { EventPlanSchema } from "@/domain/schemas";

const TODAY = "2026-10-26";

function details(overrides: Partial<EventDetailsInput> = {}): EventDetailsInput {
  return { ...jaipurWedding(TODAY).details, parts: [], ...overrides };
}

function errorsOf(input: EventDetailsInput, locale?: string): Record<string, string> {
  const result = validateEventDetails(input, TODAY, locale);
  return result.ok ? {} : result.errors;
}

describe("validateEventDetails (EM-01)", () => {
  it("accepts the demo persona and parses the budget in minor units (EM-37, EM-38)", () => {
    const result = validateEventDetails(details(), TODAY);
    expect(result).toEqual({
      ok: true,
      value: {
        useCase: "wedding",
        eventType: "wedding",
        occasion: "Ananya & Rohan's wedding",
        location: { city: "Jaipur", country: "IN" },
        eventDate: "2027-02-23",
        currency: "INR",
        budget: 80_000_000,
        guestCount: 150,
        parts: [],
      },
    });
  });

  it("reports every missing required field", () => {
    expect(Object.keys(errorsOf(emptyEventDetails())).sort()).toEqual(
      ["budget", "city", "country", "currency", "eventDate", "eventType", "guestCount", "occasion", "useCase"].sort(),
    );
  });

  it("treats whitespace-only text as missing", () => {
    expect(errorsOf(details({ occasion: "   ", city: "\t" }))).toMatchObject({
      occasion: "Enter the event name.",
      city: "Enter the city.",
    });
  });

  it("rejects text over its limit", () => {
    expect(errorsOf(details({ occasion: "x".repeat(121) })).occasion).toMatch(/120 characters/);
    expect(errorsOf(details({ city: "x".repeat(81) })).city).toMatch(/80 characters/);
  });

  it.each([
    [TODAY, "The event date must be after today."],
    ["2026-10-01", "The event date must be after today."],
    ["2026-02-30", "Enter a real date."],
    ["next week", "Enter a real date."],
  ])("rejects event date %s (EM-55)", (eventDate, message) => {
    expect(errorsOf(details({ eventDate })).eventDate).toBe(message);
  });

  it("accepts tomorrow", () => {
    expect(errorsOf(details({ eventDate: "2026-10-27" })).eventDate).toBeUndefined();
  });

  it("rejects an unknown country or currency", () => {
    expect(errorsOf(details({ country: "XX" })).country).toBe("Choose a country from the list.");
    expect(errorsOf(details({ currency: "ABC" })).currency).toBe("Choose a currency from the list.");
  });

  it.each([
    ["0", "The budget must be more than zero."],
    ["-500", "The amount can't be negative."],
    ["eight lakh", "Enter a number, for example 800000, 8 lakh or 15k."],
    ["$5000", "This event uses INR. Currency conversion isn't supported."],
    ["2000000 crore", "That amount is too large."],
  ])("rejects budget %j (EM-01, EM-38)", (budget, message) => {
    expect(errorsOf(details({ budget })).budget).toBe(message);
  });

  it("asks rather than guesses in a three-decimal currency (EM-38 a)", () => {
    expect(errorsOf(details({ currency: "BHD", budget: "8.000" })).budget).toMatch(/three decimal places/);
  });

  it("can't read the budget before a currency is chosen", () => {
    expect(errorsOf(details({ currency: "" })).budget).toBe("Choose the currency first, so the budget can be read.");
  });

  it.each([
    ["15 lakh", "INR", 150_000_000],
    ["€8.000", "EUR", 800_000],
    ["¥2,000,000", "JPY", 2_000_000],
    ["15k", "USD", 1_500_000],
  ])("reads budget %j in %s", (budget, currency, minor) => {
    const result = validateEventDetails(details({ budget, currency }), TODAY);
    expect(result.ok && result.value.budget).toBe(minor);
  });

  it.each([
    ["", "Enter the number of guests."],
    ["0", "Guests must be between 1 and 10,000."],
    ["10001", "Guests must be between 1 and 10,000."],
    ["12.5", "Enter a whole number of guests."],
    ["many", "Enter a whole number of guests."],
  ])("rejects guest count %j", (guestCount, message) => {
    expect(errorsOf(details({ guestCount })).guestCount).toBe(message);
  });

  it("validates each event part by index, and keeps their ids", () => {
    const parts = [
      { id: "p1", name: "Sangeet", guestCount: "80" },
      { id: "p2", name: "", guestCount: "0" },
    ];
    expect(errorsOf(details({ parts }))).toEqual({
      "parts.1.name": "Enter the part's name.",
      "parts.1.guestCount": "Guests must be between 1 and 10,000.",
    });

    const ok = validateEventDetails(details({ parts: [parts[0] as (typeof parts)[number]] }), TODAY);
    expect(ok.ok && ok.value.parts).toEqual([{ id: "p1", name: "Sangeet", guestCount: 80 }]);
  });

  it("allows at most four parts (Q9)", () => {
    const parts = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `Part ${i}`, guestCount: "10" }));
    expect(errorsOf(details({ parts })).parts).toBe("Add at most 4 extra parts.");
  });
});

describe("parseGuestCount", () => {
  it.each([
    ["150", 150],
    [" 150 ", 150],
    ["1,000", 1000],
    ["1.000", 1000],
    ["1 000", 1000],
    ["１５０", 150],
  ])("reads %j", (text, count) => {
    expect(parseGuestCount(text)).toBe(count);
  });

  it.each(["", "1,5", "12.5", "-3", "1e3", "10,00"])("refuses %j", (text) => {
    expect(parseGuestCount(text)).toBeNull();
  });
});

describe("hints on the form", () => {
  it("rounds the per-guest budget to whole units of the currency", () => {
    expect(budgetPerGuest(80_000_000, 150, "INR")).toBe(533_300); // ₹5,333
    expect(budgetPerGuest(2_000_000, 3, "JPY")).toBe(666_667);
    expect(budgetPerGuest(1_500_000, 60, "USD")).toBe(25_000);
  });

  it("suggests budgets every currency can read back (EM-38)", () => {
    for (const currency of ["INR", "JPY", "EUR", "USD", "BHD"]) {
      for (const text of budgetSuggestions(currency)) {
        expect(validateEventDetails(details({ currency, budget: text }), TODAY).ok).toBe(true);
      }
    }
  });

  it("maps occasions to a use case, except 'other' (EM-05)", () => {
    expect(USE_CASE_FOR_EVENT_TYPE.wedding).toBe("wedding");
    expect(USE_CASE_FOR_EVENT_TYPE.anniversary).toBe("small_celebration");
    expect(USE_CASE_FOR_EVENT_TYPE.community_gathering).toBe("community");
    expect(USE_CASE_FOR_EVENT_TYPE.other).toBeNull();
  });
});

describe("planningWindowDays (EM-01, A9)", () => {
  it("is the event date minus today", () => {
    expect(planningWindowDays("2027-02-23", TODAY)).toBe(120);
    expect(planningWindowDays("2026-10-27", TODAY)).toBe(1);
    expect(planningWindowDays(TODAY, TODAY)).toBe(0);
  });
});

describe("question form (EM-02, EM-05)", () => {
  it("sets different defaults per use case", () => {
    expect(defaultAnswers("wedding").priorities).toEqual(["venue", "catering", "photography"]);
    expect(defaultAnswers("small_celebration").priorities).toEqual(["catering", "decoration"]);
    expect(defaultAnswers("community").priorities).toContain("permits");
  });

  it("requires 1 to 3 priorities", () => {
    const base = defaultAnswers("wedding");
    expect(validateAnswers({ ...base, priorities: [] })).toEqual({
      ok: false,
      errors: { priorities: "Pick at least one spending priority." },
    });
    const four: AnswersInput = { ...base, priorities: ["venue", "catering", "photography", "decoration"] };
    expect(validateAnswers(four)).toEqual({ ok: false, errors: { priorities: "Pick at most 3 priorities." } });
  });

  it("leaves everything except priorities optional", () => {
    const result = validateAnswers({ ...defaultAnswers("community"), ageGroups: [] });
    expect(result).toEqual({
      ok: true,
      value: {
        answers: {
          priorities: ["venue", "catering", "permits"],
          mustHaves: [],
          experience: null,
          atmosphere: "",
          ageGroups: [],
          cultural: "",
          accessibility: "",
          venueConstraints: "",
        },
        description: "",
      },
    });
  });

  it("splits must-haves by line and caps them at five", () => {
    expect(splitMustHaves(" Live band \n\n\r\nFireworks ")).toEqual(["Live band", "Fireworks"]);
    const six = { ...defaultAnswers("wedding"), mustHaves: "a\nb\nc\nd\ne\nf" };
    expect(validateAnswers(six)).toMatchObject({ ok: false, errors: { mustHaves: /at most 5/ } });
    const long = { ...defaultAnswers("wedding"), mustHaves: "x".repeat(121) };
    expect(validateAnswers(long)).toMatchObject({ ok: false, errors: { mustHaves: /120 characters/ } });
  });

  it("caps the optional text answers", () => {
    const result = validateAnswers({
      ...defaultAnswers("wedding"),
      atmosphere: "x".repeat(121),
      cultural: "x".repeat(301),
      accessibility: "x".repeat(301),
      venueConstraints: "x".repeat(301),
      description: "x".repeat(2001),
    });
    expect(result.ok ? [] : Object.keys(result.errors).sort()).toEqual(
      ["accessibility", "atmosphere", "cultural", "description", "venueConstraints"].sort(),
    );
  });

  it("orders age groups and drops duplicate priorities", () => {
    const result = validateAnswers({
      ...defaultAnswers("wedding"),
      priorities: ["venue", "venue"],
      ageGroups: ["seniors", "children"],
      experience: "some",
    });
    expect(result.ok && result.value.answers).toMatchObject({
      priorities: ["venue"],
      ageGroups: ["children", "seniors"],
      experience: "some",
    });
  });
});

describe("createEventPlan", () => {
  it("builds a stored event at version 0 with no plan yet, from the user's own inputs", () => {
    const example = jaipurWedding(TODAY);
    const detailsResult = validateEventDetails(example.details, TODAY);
    const answersResult = validateAnswers(example.answers);
    if (!detailsResult.ok || !answersResult.ok) throw new Error("example should be valid");

    const plan = createEventPlan({ id: "evt-1", details: detailsResult.value, answers: answersResult.value, isDemo: true });
    expect(EventPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan).toMatchObject({
      id: "evt-1",
      version: 0,
      isDemo: true,
      demoPinned: false,
      budget: 80_000_000,
      parts: [{ id: "demo-part-mehendi", name: "Mehendi evening", guestCount: 60 }],
      answers: { mustHaves: ["Vegetarian Rajasthani thali for dinner", "Photographer for both days"] },
      description: "Family wedding with relatives travelling from Delhi and Mumbai.",
      lines: [],
      tasks: [],
    });
  });
});

describe("demo examples (UX-10)", () => {
  it.each(EXAMPLES.map((example) => [example(TODAY).key, example] as const))("%s passes both steps", (_key, example) => {
    const inputs = example(TODAY);
    expect(validateEventDetails(inputs.details, TODAY).ok).toBe(true);
    expect(validateAnswers(inputs.answers).ok).toBe(true);
  });

  it("puts the wedding 120 days out and the birthday in USD", () => {
    expect(planningWindowDays(jaipurWedding(TODAY).details.eventDate, TODAY)).toBe(120);
    const birthday = validateEventDetails(austinBirthday(TODAY).details, TODAY);
    expect(birthday.ok && [birthday.value.currency, birthday.value.budget]).toEqual(["USD", 1_500_000]);
  });
});

describe("regions", () => {
  it("lists the 249 ISO 3166-1 countries", () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(isCountryCode("IN")).toBe(true);
    expect(isCountryCode("EU")).toBe(false);
  });

  it("suggests a currency for common countries only", () => {
    expect(suggestedCurrency("IN")).toBe("INR");
    expect(suggestedCurrency("DE")).toBe("EUR");
    expect(suggestedCurrency("JP")).toBe("JPY");
    expect(suggestedCurrency("AQ")).toBeNull();
  });
});

describe("amountErrorMessage", () => {
  it("has a message for an empty field", () => {
    expect(amountErrorMessage({ kind: "error", code: "empty" }, "INR")).toBe("Enter an amount.");
  });
});
