"use client";

import type { ReactNode } from "react";
import { SessionGate } from "@/features/auth/session-gate";
import { AppHeader, DemoBanner } from "./app-header";

/** Every signed-in page: session, header, demo banner, then the page in <main>. */
export function AppShell({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <SessionGate>
      <AppHeader />
      <DemoBanner />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
        {children}
      </main>
    </SessionGate>
  );
}
