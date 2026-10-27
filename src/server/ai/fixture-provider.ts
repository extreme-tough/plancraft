import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AiCallName, AiProvider, ModelRequest, ModelResult } from "./provider";

/**
 * Answers every call with the recorded fixture under tests/fixtures/ai/<call>/valid.json, for E2E
 * runs on the emulators (AI_PROVIDER=fixture). The fixtures never ship: the files live under tests/,
 * and providers.ts refuses this provider in production, as does the boot-time env check (AI-05).
 */
export class FixtureProvider implements AiProvider {
  readonly model = "fixture";

  constructor(private readonly root = path.join(process.cwd(), "tests", "fixtures", "ai")) {}

  async generate(request: ModelRequest): Promise<ModelResult> {
    try {
      return { kind: "ok", text: await readFile(this.file(request.call), "utf8") };
    } catch {
      return { kind: "error", code: "AI_UNAVAILABLE" };
    }
  }

  private file(call: AiCallName): string {
    return path.join(this.root, call, "valid.json");
  }
}
