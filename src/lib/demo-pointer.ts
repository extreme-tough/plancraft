import type { EventPlan } from "@/domain/schemas";

/**
 * EM-58: the shared demo opens on the pinned demo event, or on the demo event this browser last
 * created or opened. The pointer lives in localStorage; whether this tab has already been sent
 * there lives in sessionStorage, so "/" lists every event after the first visit. Storage can be
 * blocked, which only costs landing on the event list.
 */
const LAST_EVENT_KEY = "plancraft.demoEvent";
const OPENED_KEY = "plancraft.demoOpened";

/** Also counts as this tab's first visit, so "All events" then lists the events. */
export function rememberDemoEvent(eventId: string): void {
  try {
    localStorage.setItem(LAST_EVENT_KEY, eventId);
    sessionStorage.setItem(OPENED_KEY, "1");
  } catch {
    // See above.
  }
}

export function rememberedDemoEvent(): string | null {
  try {
    return localStorage.getItem(LAST_EVENT_KEY);
  } catch {
    return null;
  }
}

/** True only when this tab hasn't yet been to "/" or opened a demo event. */
export function firstDemoVisit(): boolean {
  try {
    if (sessionStorage.getItem(OPENED_KEY) === "1") return false;
    sessionStorage.setItem(OPENED_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/** The event the demo opens on (EM-58): this browser's last one if it still exists, else the pinned one. */
export function openingDemoEvent(events: readonly EventPlan[], remembered: string | null): string | null {
  return events.find((event) => event.id === remembered)?.id ?? events.find((event) => event.demoPinned)?.id ?? null;
}
