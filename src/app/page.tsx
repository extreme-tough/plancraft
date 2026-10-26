import { EventsHome } from "@/features/events/events-home";
import { AppShell } from "@/features/shell/app-shell";

// EM-58: opening the app signs in to the shared demo automatically (see SessionGate).
export default function HomePage(): React.ReactElement {
  return (
    <AppShell>
      <EventsHome />
    </AppShell>
  );
}
