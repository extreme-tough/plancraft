import type { Metadata } from "next";
import { RevisionPage } from "@/features/revision/revision-page";
import { AppShell } from "@/features/shell/app-shell";

export const metadata: Metadata = { title: "Proposed revision" };

/** Figma "Revision / Before-After" (UX-08): one screen with the effect, the options, Apply and Discard. */
export default async function ReviseRoute({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ proposal?: string }>;
}): Promise<React.ReactElement> {
  const [{ eventId }, { proposal }] = await Promise.all([params, searchParams]);
  return (
    <AppShell>
      <RevisionPage eventId={eventId} proposalId={proposal ?? null} />
    </AppShell>
  );
}
