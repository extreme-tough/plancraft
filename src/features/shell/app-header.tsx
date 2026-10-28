"use client";

import { LogIn, LogOut, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSignedIn } from "@/features/auth/auth-provider";
import { loadFirebase } from "@/lib/firebase/lazy";
import { useLocale } from "@/lib/locale";

/** Brand, who is signed in, and the sign-in / sign-out controls (EM-57, EM-58). */
export function AppHeader(): React.ReactElement {
  const { user, isDemo } = useSignedIn();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const google = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await (await loadFirebase()).signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async (): Promise<void> => {
    await (await loadFirebase()).signOutUser();
    router.replace("/welcome");
  };

  return (
    <header className="border-b bg-card/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <Link href="/" className="flex items-center gap-2 rounded-md font-bold font-heading text-lg text-foreground">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-card">
            <Sparkles className="size-4" />
          </span>
          PlanCraft
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {isDemo ? (
            <Badge variant="info" size="lg">
              <Users aria-hidden="true" />
              Shared demo account
            </Badge>
          ) : (
            <span className="max-w-48 truncate text-muted-foreground text-sm" title={user.email ?? undefined}>
              {user.email ?? "Signed in"}
            </span>
          )}
          {isDemo && (
            <Button onClick={() => void google()} loading={busy}>
              <LogIn aria-hidden="true" />
              Sign in with Google
            </Button>
          )}
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </div>
      <div aria-live="polite">
        {error && (
          <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-8">
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}
      </div>
    </header>
  );
}

/** EM-58: always visible in the shared demo account. */
/** When the nightly reset last ran (EM-63), in the viewer's own time and locale. Null until known. */
function useLastReset(enabled: boolean, locale: string): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetch("/api/demo/status")
      .then((response) => (response.ok ? (response.json() as Promise<{ data?: { lastResetAt?: unknown } }>) : null))
      .then((body) => {
        const at = body?.data?.lastResetAt;
        if (!active || typeof at !== "string") return;
        const date = new Date(at);
        if (Number.isNaN(date.getTime())) return;
        setText(new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date));
      })
      // The banner simply leaves the time out.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enabled, locale]);
  return text;
}

export function DemoBanner(): React.ReactElement | null {
  const { isDemo } = useSignedIn();
  const lastReset = useLastReset(isDemo, useLocale());
  if (!isDemo) return null;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-8">
      <Alert variant="info">
        <Users aria-hidden="true" />
        <AlertDescription className="text-foreground">
          <p>
            <strong>Shared demo account:</strong> other reviewers can see and change this data. It resets every night at
            3:00 AM IST{lastReset && ` (last reset: ${lastReset})`}. Sign in with Google for a private workspace.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
