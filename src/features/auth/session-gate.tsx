"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { loadFirebase } from "@/lib/firebase/lazy";
import { wasSignedOut } from "@/lib/session-flag";
import { AuthProvider, useAuth } from "./auth-provider";

/**
 * Wraps every signed-in page. With no session, it signs in to the shared demo automatically
 * (EM-58), unless the person explicitly signed out, in which case it sends them to /welcome.
 */
export function SessionGate({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}

function Gate({ children }: { children: ReactNode }): React.ReactElement {
  const auth = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  const enterDemo = useCallback(async () => {
    setError(null);
    try {
      await (await loadFirebase()).signInToDemo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The demo couldn't start.");
    }
  }, []);

  useEffect(() => {
    if (auth.status !== "signed-out" || attempted.current) return;
    attempted.current = true;
    if (wasSignedOut()) router.replace("/welcome");
    else void enterDemo();
  }, [auth.status, enterDemo, router]);

  if (auth.status === "signed-in") return <>{children}</>;

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4">
      {error ? (
        <Alert variant="error">
          <AlertTitle>Couldn&apos;t open the demo</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button className="mt-3" onClick={() => void enterDemo()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-muted-foreground">
          <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
          Opening PlanCraft…
        </p>
      )}
    </main>
  );
}
