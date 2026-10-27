import type { Metadata } from "next";
import { Suspense } from "react";
import { EventCreateWizard } from "@/features/event-create/event-create-wizard";
import { AppShell } from "@/features/shell/app-shell";

export const metadata: Metadata = { title: "Create an event" };

/** Figma "Event Creation": step 1 details, step 2 questions (?step=2). */
export default function NewEventPage(): React.ReactElement {
  return (
    <AppShell>
      <Suspense>
        <EventCreateWizard />
      </Suspense>
    </AppShell>
  );
}
