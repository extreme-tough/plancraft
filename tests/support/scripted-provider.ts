import type { AiProvider, ModelRequest, ModelResult } from "@/server/ai/provider";

/** A provider that answers from a script, one entry per call, and records what it was asked. */
export class ScriptedProvider implements AiProvider {
  readonly model = "scripted";
  readonly requests: ModelRequest[] = [];

  constructor(private readonly script: Array<string | ModelResult>) {}

  async generate(request: ModelRequest): Promise<ModelResult> {
    this.requests.push(request);
    const next = this.script[this.requests.length - 1];
    if (next === undefined) throw new Error("ScriptedProvider ran out of answers");
    return typeof next === "string" ? { kind: "ok", text: next } : next;
  }
}
