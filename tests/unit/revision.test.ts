import { describe, expect, it } from "vitest";
import { constraintChanges, currentValue, opsForChanges } from "@/domain/revision";
import { makePlan } from "../support/factories";

/** Constraint changes (EM-27, EM-55, §8.6): canonical values and the code-built ops they become. */
const TODAY = "2026-10-26";

describe("opsForChanges", () => {
  it("turns budget, date and guest changes into event-level ops", () => {
    expect(
      opsForChanges(
        [
          { field: "budget", after: "60000000" },
          { field: "date", after: "2027-02-09" },
          { field: "guests", after: "120" },
        ],
        TODAY,
      ),
    ).toEqual({
      ok: true,
      ops: [
        { op: "set_event_budget", value: 60_000_000 },
        { op: "set_event_date", value: "2027-02-09" },
        { op: "set_event_guests", value: 120 },
      ],
    });
  });

  it.each([
    [{ field: "budget" as const, after: "6 lakh" }, /valid amount/],
    [{ field: "budget" as const, after: "0" }, /more than zero/],
    [{ field: "budget" as const, after: "99999999999999" }, /more than zero/],
    [{ field: "date" as const, after: "2027-02-30" }, /real date/],
    [{ field: "date" as const, after: TODAY }, /after today/],
    [{ field: "guests" as const, after: "12.5" }, /whole number/],
    [{ field: "guests" as const, after: "0" }, /between 1 and 10,000/],
    [{ field: "guests" as const, after: "10001" }, /between 1 and 10,000/],
  ])("refuses %j", (change, message) => {
    const result = opsForChanges([change], TODAY);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(message);
  });

  it("allows no changes at all (a free-text request)", () => {
    expect(opsForChanges([], TODAY)).toEqual({ ok: true, ops: [] });
  });
});

describe("constraintChanges", () => {
  const plan = makePlan({ budget: 80_000_000, eventDate: "2027-02-23", guestCount: 150 });

  it("records before and after in canonical form, dropping fields that don't change", () => {
    expect(
      constraintChanges(plan, [
        { field: "budget", after: "60000000" },
        { field: "date", after: "2027-02-23" },
        { field: "guests", after: "120" },
      ]),
    ).toEqual([
      { field: "budget", before: "80000000", after: "60000000" },
      { field: "guests", before: "150", after: "120" },
    ]);
  });

  it("reads the current value of each field", () => {
    expect([currentValue(plan, "budget"), currentValue(plan, "date"), currentValue(plan, "guests")]).toEqual(["80000000", "2027-02-23", "150"]);
  });
});
