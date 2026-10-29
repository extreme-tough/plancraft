import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DescribeResponseSchema, describeTextProblem, type DescribeRequest, type DescribeResponse } from "@/domain/describe-contract";
import { generateValidated, PARSE_RULE, SCHEMA_RULE, validateOutput } from "@/server/ai/pipeline";
import { toProviderSchema } from "@/server/ai/provider-schema";
import { DESCRIBE_CALL } from "@/server/ai/schemas/describe";
import { ScriptedProvider } from "../support/scripted-provider";

/** Contract tests for the describe call (AI-13, ENG-07): the fixture, every malformed class, code's checks, repair. */

const FIXTURE = readFileSync("tests/fixtures/ai/describe/valid.json", "utf8");
const TEXT =
  "Ananya and Rohan's wedding in Jaipur on 26 February, about 150 guests and a budget of ₹8 lakh, with a Mehendi evening for 60 the night before. " +
  "Fully vegetarian food with a Jain counter; one grandparent uses a wheelchair.";
const request = (overrides: Partial<DescribeRequest> = {}): DescribeRequest => ({ text: TEXT, today: "2026-10-29", ...overrides });
const fixture = (): DescribeResponse => DescribeResponseSchema.parse(JSON.parse(FIXTURE));

function validate(output: unknown, req = request()) {
  return validateOutput(DESCRIBE_CALL, typeof output === "string" ? output : JSON.stringify(output), req);
}

describe("describe contract: the recorded fixture", () => {
  it("passes the schema, and code keeps every grounded value", () => {
    const result = validate(FIXTURE);
    expect(result).toMatchObject({
      ok: true,
      data: { country: "IN", currency: "INR", eventDate: "2030-02-26", budgetText: "8 lakh", guestCount: 150, parts: [{ name: "Mehendi evening", guestCount: 60 }] },
    });
  });

  it("generates a provider schema with no label field and no $ref or oneOf (Gemini subset)", () => {
    const schema = JSON.stringify(toProviderSchema(DescribeResponseSchema));
    expect(schema).not.toMatch(/"\$ref"|"oneOf"|"label"/);
  });
});

describe("describe contract: malformed output fails the schema", () => {
  it.each([
    ["not JSON", "{oops", PARSE_RULE],
    ["an extra field", { ...fixture(), confidence: 0.9 }, SCHEMA_RULE],
    ["an unknown event type", { ...fixture(), eventType: "gala" }, SCHEMA_RULE],
    ["a lower-case country", { ...fixture(), country: "in" }, SCHEMA_RULE],
    ["a date in another format", { ...fixture(), eventDate: "26/02/2030" }, SCHEMA_RULE],
    ["a fractional guest count", { ...fixture(), guestCount: 150.5 }, SCHEMA_RULE],
    ["four priorities", { ...fixture(), priorities: ["venue", "catering", "decoration", "attire"] }, SCHEMA_RULE],
    ["contingency as a priority", { ...fixture(), priorities: ["contingency"] }, SCHEMA_RULE],
    ["five parts", { ...fixture(), parts: Array.from({ length: 5 }, (_, i) => ({ name: `Part ${i}`, guestCount: null })) }, SCHEMA_RULE],
  ])("%s", (_, output, rule) => {
    expect(validate(output)).toEqual({ ok: false, failed: [rule] });
  });
});

describe("describe contract: code drops what it can't trust", () => {
  const data = (output: DescribeResponse, req = request()): DescribeResponse => {
    const result = validate(output, req);
    if (!result.ok) throw new Error(`unexpected failure: ${result.failed.join(",")}`);
    return result.data;
  };

  it("drops a budget or guest count the text doesn't state (grounding)", () => {
    const out = data({ ...fixture(), budgetText: "10 lakh", guestCount: 200, parts: [{ name: "Mehendi evening", guestCount: 75 }] });
    expect(out.budgetText).toBeNull();
    expect(out.guestCount).toBeNull();
    expect(out.parts[0]?.guestCount).toBeNull();
  });

  it("drops a date that is past, today or not a real day (EM-55)", () => {
    expect(data({ ...fixture(), eventDate: "2026-10-29" }).eventDate).toBeNull();
    expect(data({ ...fixture(), eventDate: "2025-02-26" }).eventDate).toBeNull();
    expect(data({ ...fixture(), eventDate: "2030-02-30" }).eventDate).toBeNull();
  });

  it("drops a country or currency that isn't a real code, and a budget it then can't read", () => {
    const out = data({ ...fixture(), country: "XX", currency: "ABC" });
    expect(out.country).toBeNull();
    expect(out.currency).toBeNull();
    expect(out.budgetText).toBeNull(); // no currency to parse "8 lakh" in
  });

  it("reads the budget in the country's currency when none is stated", () => {
    expect(data({ ...fixture(), currency: null }).budgetText).toBe("8 lakh");
  });
});

describe("describe contract: request checks", () => {
  it("refuses too little text before calling the model", () => {
    expect(describeTextProblem("A party")).toMatch(/at least 20 characters/);
    expect(describeTextProblem(TEXT)).toBeNull();
  });
});

describe("describe contract: one repair attempt (spec §7.2.7)", () => {
  it("repairs a schema failure on the second attempt", async () => {
    const provider = new ScriptedProvider([JSON.stringify({ ...fixture(), country: "india" }), FIXTURE]);
    const result = await generateValidated(DESCRIBE_CALL, request(), provider);
    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(provider.requests[0]?.user).toContain("<description>");
  });

  it("gives up after the repair also fails", async () => {
    const result = await generateValidated(DESCRIBE_CALL, request(), new ScriptedProvider(["{oops", "{oops"]));
    expect(result).toMatchObject({ ok: false, code: "AI_INVALID_OUTPUT", attempts: 2 });
  });
});
