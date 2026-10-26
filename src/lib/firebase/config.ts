/**
 * Public Firebase web config (not secret; the API key is referrer-restricted, see docs/setup.md).
 * Next.js inlines NEXT_PUBLIC_* at build time, so each one is read by its full name.
 */
export interface FirebasePublicConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  useEmulators: boolean;
}

/** The project id the emulators run under ("demo-" projects never touch real Google Cloud). */
export const EMULATOR_PROJECT_ID = "demo-plancraft";

export const EMULATOR_HOSTS = {
  auth: "http://127.0.0.1:9099",
  firestore: { host: "127.0.0.1", port: 8080 },
} as const;

export function firebasePublicConfig(): FirebasePublicConfig {
  const useEmulators = process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "1";
  if (useEmulators) {
    return {
      apiKey: "demo-api-key",
      authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
      projectId: EMULATOR_PROJECT_ID,
      appId: "demo-app",
      useEmulators,
    };
  }
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
  const missing = Object.entries(config)
    .filter(([, value]) => value === "")
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Firebase web config is missing: ${missing.join(", ")}. See .env.example.`);
  }
  return { ...config, useEmulators };
}
