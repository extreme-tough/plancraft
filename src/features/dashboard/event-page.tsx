"use client";

import { ArrowLeft, CalendarDays, Info, MapPin, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { planningWindowDays } from "@/domain/event-input";
import { formatDate, formatMoneyCompact } from "@/domain/format";
import type { EventPlan } from "@/domain/schemas";
import { useSignedIn } from "@/features/auth/auth-provider";
import { countryName, EVENT_TYPE_TEXT, USE_CASE_TEXT } from "@/lib/display-names";
import { useLocale } from "@/lib/locale";
import { localToday } from "@/lib/today";

type Load =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "error" }
  | { state: "ready"; plan: EventPlan };

function windowText(days: number): string {
  if (days > 1) return `${days} days to plan`;
  if (days === 1) return "1 day to plan";
  if (days === 0) return "Today";
  return "This date has passed";
}

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
  const facts = [
    {
      icon: CalendarDays,
      term: "Date",
      detail: `${formatDate(plan.eventDate, locale)} · ${windowText(planningWindowDays(plan.eventDate, today))}`,
    },
    { icon: MapPin, term: "Location", detail: `${plan.location.city}, ${countryName(plan.location.country)}` },
    {
      icon: Users,
      term: "Guests",
      detail: [
        plan.guestCount.toLocaleString(locale),
        ...plan.parts.map((part) => `${part.name}: ${part.guestCount.toLocaleString(locale)}`),
      ].join(" · "),
    },
    { icon: Wallet, term: "Budget", detail: `${formatMoneyCompact(plan.budget, plan.currency, locale)} (${plan.currency})` },
  ];

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="font-bold text-2xl sm:text-3xl">{plan.occasion}</h1>
        <p className="flex flex-wrap gap-2">
          <Badge variant="outline" size="lg">
            {EVENT_TYPE_TEXT[plan.eventType]}
          </Badge>
          {/* "Wedding · Wedding" says nothing; the plan style shows only when it adds something. */}
          {USE_CASE_TEXT[plan.useCase].title !== EVENT_TYPE_TEXT[plan.eventType] && (
            <Badge variant="outline" size="lg">
              Plan style: {USE_CASE_TEXT[plan.useCase].title}
            </Badge>
          )}
        </p>
      </header>

      {/* EM-06: always shown on the plan screen. */}
      <Alert variant="info">
        <Info aria-hidden="true" />
        <AlertDescription className="font-medium text-foreground">This is a starting point. Edit anything.</AlertDescription>
      </Alert>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle render={<h2 />}>Event details</CardTitle>
          <dl className="mt-2 grid gap-4 sm:grid-cols-2">
            {facts.map(({ icon: Icon, term, detail }) => (
              <div key={term} className="flex min-w-0 flex-col gap-1">
                <dt className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  {term}
                </dt>
                <dd className="wrap-anywhere ps-6 font-medium">{detail}</dd>
              </div>
            ))}
          </dl>
        </CardHeader>
      </Card>

      {plan.lines.length === 0 && plan.tasks.length === 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle render={<h2 />}>No plan yet</CardTitle>
            <CardDescription>
              Your budget lines and task timeline will be built from the details and answers you gave.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </>
  );
}
