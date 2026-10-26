"use client";

import type { User } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { EventRepository } from "@/data/repository";
import { isDemoUid } from "@/lib/demo";
import { loadFirebase } from "@/lib/firebase/lazy";

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: User; isDemo: boolean; repository: EventRepository };

const AuthContext = createContext<AuthState>({ status: "loading" });

/**
 * Tracks the Firebase user and hands out a repository scoped to them (EM-59). The SDK is loaded
 * lazily (ENG-11), so this starts in "loading" until it arrives.
 */
export function AuthProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;
    void loadFirebase().then((firebase) => {
      if (!active) return;
      const { auth, db } = firebase.clientFirebase();
      unsubscribe = firebase.onAuthStateChanged(auth, (user) => {
        setState(
          user
            ? {
                status: "signed-in",
                user,
                isDemo: isDemoUid(user.uid),
                repository: new firebase.FirestoreEventRepository(db, user.uid),
              }
            : { status: "signed-out" },
        );
      });
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** For components that only render inside SessionGate. */
export function useSignedIn(): Extract<AuthState, { status: "signed-in" }> {
  const state = useAuth();
  if (state.status !== "signed-in") throw new Error("useSignedIn() used outside a signed-in session");
  return state;
}
