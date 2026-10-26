/** Runs once when the server starts: fail fast on a bad environment (AI-05, EM-59, ENG-02). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { serverEnv } = await import("@/server/env");
    serverEnv();
    // Load and initialise the Admin SDK now, so the first visitor's demo sign-in (EM-58) doesn't
    // pay for it after a cold start.
    const { adminFirebase } = await import("@/lib/firebase/admin");
    adminFirebase();
  }
}
