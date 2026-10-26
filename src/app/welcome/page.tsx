import type { Metadata } from "next";
import { WelcomeChoice } from "@/features/auth/welcome-choice";

export const metadata: Metadata = { title: "Welcome" };

/** Shown after sign-out: choose Google sign-in or the shared demo (EM-58). */
export default function WelcomePage(): React.ReactElement {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4 py-12">
      <WelcomeChoice />
    </main>
  );
}
