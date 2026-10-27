import type { Metadata } from "next";
import { EventPage } from "@/features/dashboard/event-page";
import { AppShell } from "@/features/shell/app-shell";

export const metadata: Metadata = { title: "Event" };

/** Figma "Plan Dashboard". The plan itself arrives with plan generation; this shows the saved event. */
export default async function EventRoute({ params }: { params: Promise<{ eventId: string }> }): Promise<React.ReactElement> {
  const { eventId } = await params;
  return (
    <AppShell>
      <EventPage eventId={eventId} />
    </AppShell>
  );
}
