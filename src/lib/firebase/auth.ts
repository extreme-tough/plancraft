"use client";

import {
  GoogleAuthProvider,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { markSignedOut } from "@/lib/session-flag";
import { clientFirebase } from "./client";

/**
 * Sign-in flows (EM-57, EM-58). Google sign-in *replaces* a demo session; it never links to it,
 * because linking would hand the shared demo account to one person (EM-60). The link APIs are
 * banned by lint.
 */

export class SignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignInError";
  }
}

/** EM-58: asks the server for a demo token and signs in with it. */
export async function signInToDemo(): Promise<User> {
  const response = await fetch("/api/demo/session", { method: "POST" }).catch(() => null);
  const body: unknown = await response?.json().catch(() => null);
  const token =
    typeof body === "object" && body !== null && "ok" in body && body.ok === true && "data" in body
      ? (body.data as { token?: unknown }).token
      : undefined;
  if (typeof token !== "string") {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body.error as { message?: unknown }).message ?? "")
        : "";
    throw new SignInError(message || "The demo couldn't start. Check your connection and try again.");
  }
  const credential = await signInWithCustomToken(clientFirebase().auth, token);
  markSignedOut(false);
  return credential.user;
}

const GOOGLE_ERRORS: Record<string, string> = {
  "auth/popup-closed-by-user": "The Google sign-in window was closed before finishing.",
  "auth/cancelled-popup-request": "The Google sign-in window was closed before finishing.",
  "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.",
  "auth/network-request-failed": "Couldn't reach Google. Check your connection and try again.",
};

/** EM-57: Google sign-in (and sign-up on first use). On failure the current session is kept. */
export async function signInWithGoogle(): Promise<User> {
  try {
    const credential = await signInWithPopup(clientFirebase().auth, new GoogleAuthProvider());
    markSignedOut(false);
    return credential.user;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    throw new SignInError(GOOGLE_ERRORS[code] ?? "Google sign-in didn't work. Please try again.");
  }
}

export async function signOutUser(): Promise<void> {
  markSignedOut(true);
  await signOut(clientFirebase().auth);
}
