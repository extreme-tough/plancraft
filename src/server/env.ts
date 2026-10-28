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
    GEMINI_MODEL: z.string().min(1).default("gemini-3.8-flash"),
    GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
    GOOGLE_CLOUD_LOCATION: z.string().min(1).default("global"),
    AI_DAILY_CAP: z.coerce.number().int().positive().default(2000),
    /** Firebase project for the Admin SDK; falls back to the public project id. */
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1).optional(),
    /** Set by `firebase emulators:exec`; the Admin SDK then talks to the local emulators. */
    FIREBASE_AUTH_EMULATOR_HOST: z.string().min(1).optional(),
    FIRESTORE_EMULATOR_HOST: z.string().min(1).optional(),
    NEXT_PUBLIC_FIREBASE_EMULATORS: z.enum(["0", "1"]).default("0"),
    /**
     * How many proxies append to X-Forwarded-For in front of the app. App Hosting's Google load
     * balancer appends "<client>, <lb>", so the client is the 2nd entry from the right.
     */
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(2),
    /** Demo sign-ins allowed per IP per minute (EM-58). E2E raises it: every test shares one IP. */
    DEMO_SESSION_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
    /** Shared-demo AI calls per IP (ENG-08: 10 a minute, 50 a day). E2E raises them: one IP for every test. */
    AI_DEMO_IP_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
    AI_DEMO_IP_LIMIT_PER_DAY: z.coerce.number().int().positive().default(50),
    /** Service account Cloud Scheduler signs its OIDC token with (EM-63, slice S8). */
    DEMO_RESET_INVOKER: z.string().min(1).optional(),
    /** The reset URL, which is the audience of that token. The reset route is off without both. */
    DEMO_RESET_AUDIENCE: z.url().optional(),
  })
  .transform((env) => ({
    ...env,
    appEnv: env.APP_ENV ?? (env.NODE_ENV === "production" ? "production" : env.NODE_ENV),
    usesEmulators:
      env.NEXT_PUBLIC_FIREBASE_EMULATORS === "1" ||
      env.FIREBASE_AUTH_EMULATOR_HOST !== undefined ||
      env.FIRESTORE_EMULATOR_HOST !== undefined,
  }))
  // AI-05: fixture answers must never reach real users.
  .refine((env) => !(env.appEnv === "production" && env.AI_PROVIDER === "fixture"), {
    message: "AI_PROVIDER=fixture is not allowed in production (AI-05).",
    path: ["AI_PROVIDER"],
  })
  // EM-59: the live app must never point at local emulators.
  .refine((env) => !(env.appEnv === "production" && env.usesEmulators), {
    message: "Firebase emulators are not allowed in production (EM-59).",
    path: ["FIRESTORE_EMULATOR_HOST"],
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
