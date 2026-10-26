"use client";

/**
 * Everything that pulls in the Firebase SDK, gathered in one module that is loaded with a dynamic
 * import after the page shell renders (ENG-11: the SDK is ~240 KB gzipped and must not count
 * against the first load). Import it only through `loadFirebase()`.
 */
export { onAuthStateChanged } from "firebase/auth";
export { FirestoreEventRepository } from "@/data/firestore-repository";
export { signInToDemo, signInWithGoogle, signOutUser } from "./auth";
export { clientFirebase } from "./client";
