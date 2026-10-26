"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { EMULATOR_HOSTS, firebasePublicConfig } from "./config";

/** Browser-side Firebase, created once per page load. */
interface ClientFirebase {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let instance: ClientFirebase | undefined;

export function clientFirebase(): ClientFirebase {
  if (instance) return instance;

  const config = firebasePublicConfig();
  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  // EM-39: edits made offline are kept in IndexedDB and sent when the connection returns.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    // The local emulator's streaming channel stalls under several browsers at once; long polling
    // is reliable there. Production keeps the default transport.
    ...(config.useEmulators ? { experimentalForceLongPolling: true } : {}),
  });

  if (config.useEmulators) {
    connectAuthEmulator(auth, EMULATOR_HOSTS.auth, { disableWarnings: true });
    connectFirestoreEmulator(db, EMULATOR_HOSTS.firestore.host, EMULATOR_HOSTS.firestore.port);
  }

  instance = { app, auth, db };
  return instance;
}
