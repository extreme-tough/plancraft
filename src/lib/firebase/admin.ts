import "server-only";
import { applicationDefault, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { serverEnv } from "@/server/env";
import { EMULATOR_PROJECT_ID } from "./config";

/**
 * Server-side Firebase. On App Hosting it runs as the backend's service account (no key file);
 * under `firebase emulators:exec` it talks to the local emulators.
 */
interface AdminFirebase {
  app: App;
  auth: Auth;
  db: Firestore;
}

let instance: AdminFirebase | undefined;

export function adminFirebase(): AdminFirebase {
  if (instance) return instance;

  const env = serverEnv();
  if (env.usesEmulators) {
    // Off Google Cloud, google-auth-library otherwise spends seconds probing the metadata server
    // before the first Firestore call. Never set in production (env.ts refuses emulators there).
    process.env.METADATA_SERVER_DETECTION ??= "none";
  }
  const projectId = env.usesEmulators
    ? EMULATOR_PROJECT_ID
    : (env.GOOGLE_CLOUD_PROJECT ?? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

  // With emulators there is no service account to discover; naming one stops the Admin SDK from
  // waiting on the (unreachable) Google Cloud metadata server before it mints a custom token.
  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp(
          env.usesEmulators
            ? { projectId, serviceAccountId: `emulator@${projectId}.iam.gserviceaccount.com` }
            : { projectId, credential: applicationDefault() },
        );

  instance = { app, auth: getAuth(app), db: getFirestore(app) };
  return instance;
}
