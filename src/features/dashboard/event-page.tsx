"use client";

import { ArrowLeft, Info } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import type { EventPlan } from "@/domain/schemas";
import { useSignedIn } from "@/features/auth/auth-provider";
import { useLocale } from "@/lib/locale";
import { localToday } from "@/lib/today";
import { Dashboard } from "./dashboard";
import { HeroCard } from "./hero-card";
import { PlanGenerator } from "./plan-generator";

type Load =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "error" }
  | { state: "ready"; plan: EventPlan };

/** One event, kept live so other people's changes in the shared demo appear (EM-62). */
export function EventPage({ eventId }: { eventId: string }): React.ReactElement {
  const { repository } = useSignedIn();
  const locale = useLocale();
  const [today] = useState(localToday);
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(
    () =>
      repository.subscribeEvent(
        eventId,
        (plan) => setLoad(plan ? { state: "ready", plan } : { state: "missing" }),
        () => setLoad({ state: "error" }),
      ),
    [repository, eventId],
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href="/" className="inline-flex items-center gap-1 self-start rounded-md text-accent-foreground text-sm underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" />
        All events
      </Link>

      <div aria-live="polite">
        {load.state === "loading" && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
            Loading the event…
          </p>
        )}
        {load.state === "missing" && (
          <Alert variant="warning">
            <AlertTitle>Event not found</AlertTitle>
            <AlertDescription>It may have been deleted, or it belongs to another account.</AlertDescription>
          </Alert>
        )}
        {load.state === "error" && (
          <Alert variant="error">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>This event couldn&apos;t be loaded. Please reload the page.</AlertDescription>
          </Alert>
        )}
      </div>

      {load.state === "ready" && <EventSummary plan={load.plan} today={today} locale={locale} />}
    </div>
  );
}

function EventSummary({ plan, today, locale }: { plan: EventPlan; today: string; locale: string }): React.ReactElement {
  const [startedEmpty, setStartedEmpty] = useState(false);
  if (plan.lines.length > 0 || plan.tasks.length > 0 || startedEmpty) {
    return <Dashboard stored={plan} today={today} locale={locale} />;
  }
  return (
    <>
      <HeroCard plan={plan} today={today} locale={locale} />
      {/* EM-06: always shown on the plan screen. */}
      <Alert variant="info">
        <Info aria-hidden="true" />
        <AlertDescription className="font-medium text-foreground">This is a starting point. Edit anything.</AlertDescription>
      </Alert>
      <PlanGenerator plan={plan} onStartEmpty={() => setStartedEmpty(true)} />
    </>
  );
}
