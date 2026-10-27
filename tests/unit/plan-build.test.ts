import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summarizeBudget } from "@/domain/budget";
import { applyGeneratedPlan, isUnderFunded, lineEstimateTotal, planRequestFor } from "@/domain/plan-build";
import { PlanResponseSchema, planRequestProblem, type PlanResponse } from "@/domain/plan-contract";
import { EventPlanSchema } from "@/domain/schemas";
import { makePlan } from "../support/factories";

const FIXTURE: PlanResponse = PlanResponseSchema.parse(JSON.parse(readFileSync("tests/fixtures/ai/plan/valid.json", "utf8")));

function ids(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

describe("planRequestFor (EM-03, EM-07, AI-01)", () => {
  it("sends every event field and every answer, with money in major units", () => {
    const plan = makePlan({
      parts: [{ id: "p1", name: "Sangeet", guestCount: 80 }],
      answers: {
        priorities: ["venue", "catering"],
        mustHaves: ["Live band"],
        experience: "first_time",
        atmosphere: "Relaxed",
        ageGroups: ["adults", "seniors"],
        cultural: "Vegetarian only",
        accessibility: "Step-free access",
        venueConstraints: "Indoor",
      },
      description: "Family wedding",
    });
    expect(planRequestFor(plan, "2026-10-26")).toEqual({
      useCase: "wedding",
      eventType: "wedding",
      occasion: "Ananya & Rohan's wedding",
      location: { city: "Jaipur", country: "IN" },
      eventDate: "2027-02-21",
      today: "2026-10-26",
      currency: "INR",
      budget: 800_000,
      guestCount: 150,
      parts: [{ name: "Sangeet", guestCount: 80 }],
      answers: {
        priorities: ["venue", "catering"],
        mustHaves: ["Live band"],
        experience: "first_time",
        atmosphere: "Relaxed",
        ageGroups: ["adults", "seniors"],
        cultural: "Vegetarian only",
        accessibility: "Step-free access",
        venueConstraints: "Indoor",
      },
      description: "Family wedding",
    });
  });

  it("leaves out an unanswered experience level instead of sending null", () => {
    expect(planRequestFor(makePlan(), "2026-10-26").answers).not.toHaveProperty("experience");
  });

  it("sends JPY and BHD budgets in major units", () => {
    expect(planRequestFor(makePlan({ currency: "JPY", budget: 2_000_000 }), "2026-10-26").budget).toBe(2_000_000);
    expect(planRequestFor(makePlan({ currency: "BHD", budget: 5_000_500 }), "2026-10-26").budget).toBe(5_000.5);
  });
});

describe("planRequestProblem (spec §7.3 request rules)", () => {
  const base = planRequestFor(makePlan({ eventDate: "2027-02-21" }), "2026-10-26");

  it("accepts a normal request, and a device date one day off the server's", () => {
    expect(planRequestProblem(base, "2026-10-26")).toBeNull();
    expect(planRequestProblem(base, "2026-10-25")).toBeNull();
    expect(planRequestProblem(base, "2026-10-27")).toBeNull();
  });

  it.each([
    [{ currency: "XYZ" }, "2026-10-26", "Unknown currency."],
    [{}, "2026-10-29", "Today's date doesn't match the server's."],
    [{ eventDate: "2026-10-26" }, "2026-10-26", "The event date must be after today."],
    [
      { parts: [{ name: "Sangeet", guestCount: 5 }, { name: "sangeet ", guestCount: 9 }] },
      "2026-10-26",
      "Part names must be unique.",
    ],
  ])("refuses %j on %s", (change, serverDate, message) => {
    expect(planRequestProblem({ ...base, ...change }, serverDate)).toBe(message);
  });
});

describe("applyGeneratedPlan (spec §7.3, EM-14, EM-19, INV-9)", () => {
  const plan = makePlan({ parts: [{ id: "p1", name: "Mehendi evening", guestCount: 60 }] });

  it("splits the user's own budget by weight, exactly, with the leftover in remaining (INV-1, INV-5)", () => {
    const next = applyGeneratedPlan(plan, FIXTURE, ids());
    const summary = summarizeBudget(next);
    expect(summary.allocated + summary.remaining).toBe(plan.budget);
    expect(summary.remaining).toBeGreaterThanOrEqual(0);
    // Flat lines get their allocation exactly; only per-guest flooring leaves anything over.
    expect(summary.remaining).toBeLessThan(150);
    const venue = next.lines.find((l) => l.category === "venue");
    expect(venue?.amount).toBe(24_000_000); // 30 / 100 of ₹8,00,000.00
  });

  it("prices per-guest lines as unit cost × guests (INV-9)", () => {
    const catering = applyGeneratedPlan(plan, FIXTURE, ids()).lines.find((l) => l.category === "catering");
    expect(catering).toMatchObject({ pricing: "per_guest", guestSource: "event", ownGuests: null });
    // 35% of 80,000,000 = 28,000,000; ÷ 150 guests = 186,666.67 → floor 186,666 paise a plate.
    expect(catering?.unitCost).toBe(186_666);
    expect(catering?.amount).toBe(186_666 * 150);
  });

  it("gives a part's per-guest line that part's own guests", () => {
    const withPart: PlanResponse = {
      ...FIXTURE,
      budgetLines: FIXTURE.budgetLines.map((line) => (line.key === "L2" ? { ...line, part: "Mehendi evening" } : line)),
    };
    const catering = applyGeneratedPlan(plan, withPart, ids()).lines.find((l) => l.category === "catering");
    expect(catering).toMatchObject({ partId: "p1", guestSource: "own", ownGuests: 60 });
    expect(catering?.amount).toBe((catering?.unitCost ?? 0) * 60);
  });

  it("labels every line AI Estimate and keeps its assumptions and vendor needs (EM-19, EM-29, EM-30)", () => {
    const next = applyGeneratedPlan(plan, FIXTURE, ids());
    expect(new Set(next.lines.map((l) => l.label))).toEqual(new Set(["ai_estimate"]));
    expect(next.lines[0]).toMatchObject({
      quoteId: null,
      payment: null,
      assumptions: ["A mid-range banquet hall or garden for one evening."],
      vendorNeeds: ["Step-free entrance and an accessible restroom", "Backup power"],
    });
  });

  it("stores estimates in minor units, per guest for per-guest lines", () => {
    const next = applyGeneratedPlan(plan, FIXTURE, ids());
    const catering = next.lines.find((l) => l.category === "catering");
    expect(catering?.estimate).toEqual({ low: 120_000, high: 250_000 });
    expect(catering && lineEstimateTotal(catering, 150)).toEqual({ low: 18_000_000, high: 37_500_000 });
  });

  it("maps keys to ids and keeps the dependency chain (EM-23)", () => {
    const next = applyGeneratedPlan(plan, FIXTURE, ids());
    const byTitle = new Map(next.tasks.map((t) => [t.title, t]));
    expect(byTitle.get("Book caterer")?.dependsOn).toEqual([byTitle.get("Book venue")?.id]);
    expect(byTitle.get("Menu tasting")?.lineId).toBe(next.lines.find((l) => l.category === "catering")?.id);
    expect(next.tasks.every((t) => t.status === "not_started")).toBe(true);
  });

  it("stores the plan's assumptions and open questions (EM-11) and stays a valid event", () => {
    const next = applyGeneratedPlan(plan, FIXTURE, ids());
    expect(next.assumptions).toEqual(FIXTURE.assumptions);
    expect(next.openQuestions).toEqual(FIXTURE.openQuestions);
    expect(EventPlanSchema.safeParse(next).success).toBe(true);
    expect(next.version).toBe(plan.version); // the repository bumps it on save (EM-62)
  });

  it("works in a zero-decimal currency", () => {
    const yen = makePlan({ currency: "JPY", budget: 2_000_000 });
    const summary = summarizeBudget(applyGeneratedPlan(yen, FIXTURE, ids()));
    expect(summary.allocated + summary.remaining).toBe(2_000_000);
  });
});

describe("isUnderFunded (spec §7.3)", () => {
  it("flags a line whose amount is below the low end of its range", () => {
    const next = applyGeneratedPlan(makePlan({ budget: 1_000_000 }), FIXTURE, ids()); // ₹10,000 for everything
    const venue = next.lines.find((l) => l.category === "venue");
    expect(venue && isUnderFunded(venue, next.guestCount)).toBe(true);
  });

  it("doesn't flag a line without an estimate", () => {
    const next = applyGeneratedPlan(makePlan(), FIXTURE, ids());
    const line = { ...(next.lines[0] as (typeof next.lines)[number]), estimate: null };
    expect(isUnderFunded(line, 150)).toBe(false);
    expect(lineEstimateTotal(line, 150)).toBeNull();
  });
});
