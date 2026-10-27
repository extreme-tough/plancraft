import { z } from "zod";

/**
 * Turns a Zod contract into the JSON Schema sent to Gemini as `responseJsonSchema` (plan §4).
 * Gemini accepts a subset, so this keeps only structural keywords: flat objects, nullable fields as
 * `type: [x, "null"]`, no `$ref`, `oneOf` or `anyOf` (spec §7.2.3). Lengths, patterns and ranges the
 * provider might ignore are still checked on the server with the full Zod schema.
 *
 * No `maxItems`: on 27 Oct 2026 Vertex AI answered 400 INVALID_ARGUMENT to the plan schema with upper
 * bounds on its arrays (25 lines, 40 tasks), and accepted it without them. The prompt states the
 * counts, and the Zod schema still enforces every maximum.
 */
const KEEP = new Set(["type", "properties", "required", "items", "enum", "minItems", "minimum", "maximum", "description"]);

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function simplify(node: unknown): Json {
  if (!isObject(node)) return {};

  // z.nullable() → anyOf [X, {type: "null"}] → X with type [X.type, "null"].
  if (Array.isArray(node.anyOf)) {
    const options = node.anyOf.filter(isObject);
    const nonNull = options.filter((option) => option.type !== "null");
    if (nonNull.length !== 1 || options.length !== 2) throw new Error("Only nullable unions are supported");
    const inner = simplify(nonNull[0]);
    return { ...inner, type: [inner.type, "null"] };
  }

  const out: Json = {};
  for (const [key, value] of Object.entries(node)) {
    if (!KEEP.has(key)) continue;
    if (key === "properties" && isObject(value)) {
      out.properties = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, simplify(child)]));
    } else if (key === "items") {
      out.items = simplify(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function toProviderSchema(schema: z.ZodType): Json {
  // "output": the shape the model must produce. Refinements can't be expressed and are dropped.
  return simplify(z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }));
}
