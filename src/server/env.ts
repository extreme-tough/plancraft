import { z } from "zod";

/**
 * Server-side environment, validated once at boot (src/instrumentation.ts).
 *
 * APP_ENV names the deployment: "production" on App Hosting (apphosting.yaml), "test" for E2E runs
 * of a production build, "development" locally. It exists because `next start` always runs with
 * NODE_ENV=production, so NODE_ENV alone can't tell a test build from the live deployment.
 */
const ServerEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["development", "test", "production"]).optional(),
    AI_PROVIDER: z.enum(["vertex", "fixture"]).default("vertex"),
    GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
    GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
    GOOGLE_CLOUD_LOCATION: z.string().min(1).default("us-central1"),
    AI_DAILY_CAP: z.coerce.number().int().positive().default(2000),
  })
  .transform((env) => ({
    ...env,
    appEnv: env.APP_ENV ?? (env.NODE_ENV === "production" ? "production" : env.NODE_ENV),
  }))
  // AI-05: fixture answers must never reach real users.
  .refine((env) => !(env.appEnv === "production" && env.AI_PROVIDER === "fixture"), {
    message: "AI_PROVIDER=fixture is not allowed in production (AI-05).",
    path: ["AI_PROVIDER"],
  });

export type ServerEnv = z.output<typeof ServerEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  // A blank line such as `GOOGLE_CLOUD_PROJECT=` (as in .env.example) means "unset", not "".
  const defined = Object.fromEntries(Object.entries(source).filter(([, value]) => value?.trim()));
  const result = ServerEnvSchema.safeParse(defined);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment: ${problems}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
