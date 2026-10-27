"use client";

import { CalendarDays, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { EventPlan } from "@/domain/schemas";
import { formatDate, formatMoneyCompact } from "@/domain/format";
import { useSignedIn } from "@/features/auth/auth-provider";
import { useLocale } from "@/lib/locale";

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; events: EventPlan[] };

/** The signed-in user's events (EM-39, EM-40), and the way into creating one (EM-01). */
export function EventsHome(): React.ReactElement {
  const { repository } = useSignedIn();
  const locale = useLocale();
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    let active = true;
    repository
      .listEvents()
      .then((events) => active && setLoad({ state: "ready", events }))
      .catch(() => active && setLoad({ state: "error", message: "Your events couldn't be loaded. Please reload the page." }));
    return () => {
      active = false;
    };
  }, [repository]);

  return (
    <section aria-labelledby="events-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="events-heading" className="font-bold text-2xl sm:text-3xl">
          Your events
        </h1>
        <Button render={<Link href="/events/new" />}>
          <Plus aria-hidden="true" />
          Create an event
        </Button>
      </div>

      <div aria-live="polite">
        {load.state === "loading" && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
            Loading your events…
          </p>
        )}
        {load.state === "error" && (
          <Alert variant="error">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{load.message}</AlertDescription>
          </Alert>
        )}
      </div>

      {load.state === "ready" && load.events.length === 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>No events yet</CardTitle>
            <CardDescription>Create an event to get a budget and task plan built from your answers.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {load.state === "ready" && load.events.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {load.events.map((event) => (
            <li key={event.id}>
              <Card className="h-full shadow-card">
                <CardHeader>
                  <CardTitle>
                    <Link href={`/events/${event.id}`} className="rounded-sm underline-offset-4 hover:underline">
                      {event.occasion}
                    </Link>
                  </CardTitle>
                  <CardDescription className="flex flex-wrap gap-3">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays aria-hidden="true" className="size-4" />
                      {formatDate(event.eventDate, locale)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users aria-hidden="true" className="size-4" />
                      {event.guestCount.toLocaleString(locale)} guests
                    </span>
                    <Badge variant="outline">{formatMoneyCompact(event.budget, event.currency, locale)}</Badge>
                  </CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
