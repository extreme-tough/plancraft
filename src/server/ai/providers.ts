import "server-only";
import type { ServerEnv } from "@/server/env";
import { FixtureProvider } from "./fixture-provider";
import type { AiProvider } from "./provider";
import { VertexProvider } from "./vertex-provider";

let cached: AiProvider | undefined;

/** The configured provider. Fixture answers can never reach real users (AI-05, AI-07). */
export function createProvider(env: ServerEnv): AiProvider {
  if (env.AI_PROVIDER === "fixture") {
    if (env.appEnv === "production") throw new Error("AI_PROVIDER=fixture is not allowed in production (AI-05).");
    return new FixtureProvider();
  }
  const project = env.GOOGLE_CLOUD_PROJECT ?? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required for Vertex AI.");
  return new VertexProvider(env.GEMINI_MODEL, project, env.GOOGLE_CLOUD_LOCATION);
}

export function aiProvider(env: ServerEnv): AiProvider {
  cached ??= createProvider(env);
  return cached;
}
