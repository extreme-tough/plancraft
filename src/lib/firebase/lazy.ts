"use client";

type FirebaseRuntime = typeof import("./runtime");

let pending: Promise<FirebaseRuntime> | undefined;

/** Loads the Firebase SDK once, on demand (ENG-11). */
export function loadFirebase(): Promise<FirebaseRuntime> {
  pending ??= import("./runtime");
  return pending;
}
