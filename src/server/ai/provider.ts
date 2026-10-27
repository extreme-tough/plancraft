/**
 * The one seam between the AI pipeline and a model (plan §4). Vertex AI in the app, a fixture in
 * tests. A provider only transports text: parsing, schemas and rules are the pipeline's job, because
 * provider-side enforcement isn't trusted (spec §7.2.3).
 */
export type AiCallName = "plan" | "revise" | "quote";

export interface ModelRequest {
  call: AiCallName;
  system: string;
  user: string;
  /** Gemini-safe JSON Schema for structured output (see provider-schema.ts). */
  responseSchema: Record<string, unknown>;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

export type ModelFailure = "AI_UNAVAILABLE" | "AI_TIMEOUT" | "AI_BLOCKED";

export type ModelResult = { kind: "ok"; text: string } | { kind: "error"; code: ModelFailure };

export interface AiProvider {
  /** Reported in the response envelope's `meta.model`. */
  readonly model: string;
  generate(request: ModelRequest): Promise<ModelResult>;
}
