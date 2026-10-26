"use client";

import { LogIn, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { loadFirebase } from "@/lib/firebase/lazy";

export function WelcomeChoice(): React.ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState<"google" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (which: "google" | "demo"): Promise<void> => {
    setBusy(which);
    setError(null);
    try {
      const firebase = await loadFirebase();
      await (which === "google" ? firebase.signInWithGoogle() : firebase.signInToDemo());
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in didn't work. Please try again.");
      setBusy(null);
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>
          <h1 className="font-bold text-2xl">Welcome to PlanCraft</h1>
        </CardTitle>
        <CardDescription>
          Plan a celebration within your budget, and keep the plan working when things change.
        </CardDescription>
      </CardHeader>
      <CardPanel className="flex flex-col gap-3">
        <Button size="lg" onClick={() => void run("google")} loading={busy === "google"} disabled={busy !== null}>
          <LogIn aria-hidden="true" />
          Sign in with Google
        </Button>
        <Button size="lg" variant="outline" onClick={() => void run("demo")} loading={busy === "demo"} disabled={busy !== null}>
          <Users aria-hidden="true" />
          Enter the demo
        </Button>
        <p className="text-muted-foreground text-sm">
          The demo is one shared account: other reviewers can see and change its data, and it resets every night.
        </p>
        <div aria-live="polite">
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </CardPanel>
    </Card>
  );
}
