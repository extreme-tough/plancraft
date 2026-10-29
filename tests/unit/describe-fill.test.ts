import { describe, expect, it } from "vitest";
import { fillFromDescription, type DescribeResponse } from "@/domain/describe-contract";
import { defaultAnswers, emptyEventDetails } from "@/domain/event-input";

/** AI-13: checked values fill only the form's empty fields; anything the user typed stays. */

const response = (overrides: Partial<DescribeResponse> = {}): DescribeResponse => ({
  eventType: "wedding",
  useCase: null,
  occasion: "Ananya & Rohan's wedding",
  city: "Jaipur",
  country: "IN",
  eventDate: "2030-02-26",
  currency: null,
  budgetText: "8 lakh",
  guestCount: 150,
  parts: [{ name: "Mehendi evening", guestCount: 60 }],
  priorities: ["venue", "entertainment"],
  mustHaves: ["Indoor backup", "Live dhol"],
  experience: null,
  atmosphere: "Traditional and colourful",
  ageGroups: ["adults", "seniors"],
  cultural: "Vegetarian with a Jain counter",
  accessibility: "Step-free access",
  venueConstraints: null,
  ...overrides,
});

let n = 0;
const makeId = (): string => `id-${++n}`;

describe("fillFromDescription (AI-13)", () => {
  it("fills an empty form, taking the use case from the event type and the currency from the country", () => {
    const out = fillFromDescription({ details: emptyEventDetails(), answers: null }, response(), makeId);
    expect(out.details).toMatchObject({
      eventType: "wedding",
      useCase: "wedding",
      occasion: "Ananya & Rohan's wedding",
      city: "Jaipur",
      country: "IN",
      eventDate: "2030-02-26",
      currency: "INR",
      budget: "8 lakh",
      guestCount: "150",
      parts: [{ name: "Mehendi evening", guestCount: "60" }],
    });
    // The use case's defaults, with the text's own lists and notes on top.
    expect(out.answers).toMatchObject({
      priorities: ["venue", "entertainment"],
      ageGroups: ["adults", "seniors"],
      mustHaves: "Indoor backup\nLive dhol",
      cultural: "Vegetarian with a Jain counter",
      accessibility: "Step-free access",
      venueConstraints: "",
    });
    expect(out.filled).toContain("budget");
    expect(out.filled).toContain("1 extra part");
  });

  it("never overwrites what the user typed", () => {
    const details = { ...emptyEventDetails(), city: "Udaipur", budget: "9 lakh", currency: "INR" };
    const answers = { ...defaultAnswers("wedding"), priorities: ["photography" as const], accessibility: "Ramp at the entrance" };
    const out = fillFromDescription({ details, answers }, response(), makeId);
    expect(out.details).toMatchObject({ city: "Udaipur", budget: "9 lakh", country: "IN", guestCount: "150" });
    expect(out.answers).toMatchObject({ priorities: ["photography"], accessibility: "Ramp at the entrance", cultural: "Vegetarian with a Jain counter" });
    expect(out.filled).not.toContain("city");
    expect(out.filled).not.toContain("priorities");
  });

  it("fills nothing it wasn't given, and leaves the answers for later when the use case is unknown", () => {
    const blank = response({ eventType: null, occasion: null, city: null, country: null, eventDate: null, budgetText: null, guestCount: null, parts: [] });
    const out = fillFromDescription({ details: emptyEventDetails(), answers: null }, blank, makeId);
    expect(out.details).toEqual(emptyEventDetails());
    expect(out.answers).toBeNull();
    expect(out.filled).toEqual([]);
  });
});
