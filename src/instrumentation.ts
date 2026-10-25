/** Runs once when the server starts: fail fast on a bad environment (AI-05, ENG-02). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { serverEnv } = await import("@/server/env");
    serverEnv();
  }
}
