import type { Metadata } from "next";
import { QuotesPage } from "@/features/quotes/quotes-page";
import { AppShell } from "@/features/shell/app-shell";

export const metadata: Metadata = { title: "Compare quotes" };

/** Figma "Vendor Quote Comparison": quotes for one budget line, chosen by `?line=`. */
export default async function QuotesRoute({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ line?: string }>;
}): Promise<React.ReactElement> {
  const [{ eventId }, { line }] = await Promise.all([params, searchParams]);
  return (
    <AppShell>
      <QuotesPage eventId={eventId} lineId={line ?? null} />
    </AppShell>
  );
}
