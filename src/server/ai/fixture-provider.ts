import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AiCallName, AiProvider, ModelRequest, ModelResult } from "./provider";

/** tests/fixtures/ai/<call>/index.json: pick a fixture by text the prompt contains (e.g. a sample quote's vendor). */
const IndexSchema = z.array(z.object({ contains: z.string().min(1), file: z.string().regex(/^[a-z0-9-]+\.json$/) }));

/**
 * Answers every call with a recorded fixture under tests/fixtures/ai/<call>/, for E2E runs on the
 * emulators (AI_PROVIDER=fixture): the first index.json entry whose text the prompt contains, or
 * valid.json. The fixtures never ship: the files live under tests/, and providers.ts refuses this
 * provider in production, as does the boot-time env check (AI-05).
 */
export class FixtureProvider implements AiProvider {
  readonly model = "fixture";

  constructor(private readonly root = path.join(process.cwd(), "tests", "fixtures", "ai")) {}

  async generate(request: ModelRequest): Promise<ModelResult> {
    try {
      return { kind: "ok", text: await readFile(path.join(this.root, request.call, await this.file(request.call, request.user)), "utf8") };
    } catch {
      return { kind: "error", code: "AI_UNAVAILABLE" };
    }
  }

  private async file(call: AiCallName, user: string): Promise<string> {
    const index = await readFile(path.join(this.root, call, "index.json"), "utf8").then(
      (text) => IndexSchema.parse(JSON.parse(text)),
      () => [],
    );
    return index.find((entry) => user.includes(entry.contains))?.file ?? "valid.json";
  }
}
