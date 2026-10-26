import { request, type FullConfig } from "@playwright/test";

/**
 * Warms the freshly started server once, so the first tests measure the app rather than a cold
 * start (loading the Admin SDK and opening its first Firestore connection takes several seconds).
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;
  const context = await request.newContext({ baseURL });
  try {
    const session = await context.post("/api/demo/session", { timeout: 60_000 });
    if (!session.ok()) throw new Error(`Warm-up demo sign-in failed with ${session.status()}`);
    await context.get("/", { timeout: 60_000 });
  } finally {
    await context.dispose();
  }
}
