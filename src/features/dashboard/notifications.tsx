"use client";

import { Bell, CalendarClock, CircleAlert, Coins, FileWarning, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { activeAlerts, alertText, dismissAlert, planAlerts, type PlanAlert } from "@/domain/alerts";
import type { Quote } from "@/domain/quote";
import { viewQuote, type QuoteView } from "@/domain/quote-checks";
import { useSignedIn } from "@/features/auth/auth-provider";
import type { PlanEditor } from "./use-plan-editor";

const ICON: Record<PlanAlert["kind"], typeof Bell> = {
  confirmed_overrun: Coins,
  task_overdue: CircleAlert,
  task_tight: CalendarClock,
  balance_due: Coins,
  quote_flag: FileWarning,
};

/**
 * EM-65 (Figma notifications bell): only calculated alerts, never pushed or emailed. Dismissing one
 * is a plan edit, so it is saved with the version check like any other (EM-62).
 */
export function Notifications({ editor, today, locale }: { editor: PlanEditor; today: string; locale: string }): React.ReactElement {
  const { repository } = useSignedIn();
  const { plan } = editor;
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => repository.subscribeQuotes(plan.id, setQuotes, () => setQuotes([])), [repository, plan.id]);

  const all = useMemo(() => {
    const linked = new Map<string, QuoteView>();
    for (const line of plan.lines) {
      const quote = line.quoteId ? quotes.find((q) => q.id === line.quoteId) : undefined;
      const view = quote ? viewQuote(quote, line, plan) : null;
      if (view) linked.set(line.id, view);
    }
    return planAlerts(plan, today, linked);
  }, [plan, today, quotes]);
  const alerts = activeAlerts(plan, all);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const dismiss = (alert: PlanAlert): void => {
    void editor.edit("dismissing a notification", (p) => dismissAlert(p, alert.id, all));
    // Keep focus in the panel: on the next alert's button, or the bell when none is left.
    if (alerts.length <= 1) button.current?.focus();
  };

  const count = alerts.length;
  return (
    <div ref={root} className="relative">
      <Button
        ref={button}
        variant="outline"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications: ${count}`}
      >
        <Bell aria-hidden="true" />
        <span aria-hidden="true" className="tabular-nums">
          {count}
        </span>
      </Button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Notifications"
          className="absolute end-0 top-full z-20 mt-2 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 rounded-2xl border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <p className="px-1 font-semibold">Notifications</p>
          {count === 0 ? (
            <p className="px-1 text-muted-foreground text-sm">Nothing needs your attention.</p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
              {alerts.map((alert) => {
                const Icon = ICON[alert.kind];
                const text = alertText(alert, plan.currency, locale);
                return (
                  <li key={alert.id} className="flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-muted/60">
                    <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
                    <span className="wrap-anywhere flex-1">{text}</span>
                    <Button variant="ghost" size="icon-sm" aria-label={`Dismiss: ${text}`} disabled={editor.busy} onClick={() => dismiss(alert)}>
                      <X aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="px-1 text-muted-foreground text-xs">Worked out from your plan. Nothing is sent by email.</p>
        </div>
      )}
    </div>
  );
}
