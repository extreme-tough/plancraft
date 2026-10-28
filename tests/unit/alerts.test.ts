import { describe, expect, it } from "vitest";
import { activeAlerts, alertText, dismissAlert, planAlerts } from "@/domain/alerts";
import { confirmLine, setPayment, setTeamNotes } from "@/domain/edits";
import { DomainError } from "@/domain/errors";
import { moodboardUploadError } from "@/domain/moodboard";
import type { QuoteView } from "@/domain/quote-checks";
import { finalTestPlan, makeTask } from "../support/factories";

/** EM-65 notifications, from calculated alerts only; EM-64 payments; EM-66 team notes. */
const TODAY = "2026-10-26";
const plan = finalTestPlan(TODAY); // the event is 120 days out; nothing is overdue or tight

const inDays = (days: number): string => new Date(Date.UTC(2026, 9, 26 + days)).toISOString().slice(0, 10);

describe("planAlerts (EM-65)", () => {
  it("has nothing to say about a plan on track", () => {
    expect(planAlerts(plan, TODAY)).toEqual([]);
  });

  it("flags overdue and tight tasks, overdue first", () => {
    const p = {
      ...plan,
      tasks: [
        ...plan.tasks,
        makeTask({ id: "tight", title: "Order invitations", leadTimeDays: 115, durationDays: 10 }), // due in 5 days, takes 10
        makeTask({ id: "late", title: "Shortlist venues", leadTimeDays: 125, durationDays: 3 }), // was due 5 days ago
      ],
    };
    const alerts = planAlerts(p, TODAY);
    expect(alerts.map((a) => a.kind)).toEqual(["task_overdue", "task_tight"]);
    expect(alertText(alerts[0]!, "INR", "en-IN")).toMatch(/^Overdue: Shortlist venues \(was due /);
    expect(alertText(alerts[1]!, "INR", "en-IN")).toMatch(/^Start now: Order invitations is due /);
  });

  it("flags confirmed costs over the budget (EM-42)", () => {
    const p = confirmLine(confirmLine({ ...plan, budget: 40_000_000 }, "catering"), "decor");
    const [alert] = planAlerts(p, TODAY);
    expect(alert?.kind).toBe("confirmed_overrun");
    expect(alertText(alert!, "INR", "en-IN")).toBe("Confirmed costs are ₹2,70,000 over the budget.");
  });

  it("flags a balance due within 7 days or past, but not one paid in full or further out (EM-64)", () => {
    let p = setPayment(plan, "decor", { paid: 4_000_000, balanceDue: inDays(3), note: "Advance paid" });
    p = setPayment(p, "photo", { paid: 0, balanceDue: inDays(-1), note: "" });
    p = setPayment(p, "music", { paid: 0, balanceDue: inDays(8), note: "" });
    p = setPayment(p, "venue", { paid: 25_000_000, balanceDue: inDays(1), note: "" });
    const alerts = planAlerts(p, TODAY);
    expect(alerts.map((a) => (a.kind === "balance_due" ? a.lineId : a.kind))).toEqual(["photo", "decor"]);
    expect(alertText(alerts[0]!, "INR", "en-IN")).toMatch(/^Payment overdue: ₹80,000 for Photography was due /);
    expect(alertText(alerts[1]!, "INR", "en-IN")).toMatch(/^Payment due in 3 days: ₹80,000 for Decoration, by /);
  });

  it("flags a gap or unclear tax on a linked quote, with an id that fits the stored limit", () => {
    const p = { ...plan, lines: plan.lines.map((l) => (l.id === "catering" ? { ...l, quoteId: "q1", label: "vendor_quoted" as const } : l)) };
    const view = { quote: { id: "q1" }, totalCheck: { kind: "gap", difference: 500 }, details: { taxTreatment: "unclear" }, exclTax: false } as unknown as QuoteView;
    const [alert] = planAlerts(p, TODAY, new Map([["catering", view]]));
    expect(alert).toMatchObject({ kind: "quote_flag", flags: ["total_gap", "tax_unclear"] });
    expect(alertText(alert!, "INR", "en-IN")).toBe("The quote linked to Catering has a gap in its total and unclear tax.");
    expect(alert!.id.length).toBeLessThanOrEqual(80);
  });

  it("hides dismissed alerts, prunes stale ids, and shows an alert again when its state changes", () => {
    const late = { ...plan, tasks: [...plan.tasks, makeTask({ id: "late", title: "Shortlist venues", leadTimeDays: 125, durationDays: 3 })] };
    const alerts = planAlerts(late, TODAY);
    const dismissed = dismissAlert({ ...late, dismissedAlerts: ["gone:1"] }, alerts[0]!.id, alerts);
    expect(dismissed.dismissedAlerts).toEqual([alerts[0]!.id]);
    expect(activeAlerts(dismissed, planAlerts(dismissed, TODAY))).toEqual([]);
    // A new deadline is a new alert.
    const moved = { ...dismissed, tasks: dismissed.tasks.map((t) => (t.id === "late" ? { ...t, leadTimeDays: 124 } : t)) };
    expect(activeAlerts(moved, planAlerts(moved, TODAY))).toHaveLength(1);
  });
});

describe("payments and notes (EM-64, EM-66)", () => {
  it("records a payment on any line, confirmed ones too, and clears an empty one", () => {
    const p = setPayment(plan, "venue", { paid: 10_000_000, balanceDue: "2026-12-01", note: "  Advance  " });
    expect(p.lines.find((l) => l.id === "venue")?.payment).toEqual({ paid: 10_000_000, balanceDue: "2026-12-01", note: "Advance" });
    expect(setPayment(p, "venue", { paid: 0, balanceDue: null, note: " " }).lines.find((l) => l.id === "venue")?.payment).toBeNull();
  });

  it("refuses a payment above the line's amount", () => {
    expect(() => setPayment(plan, "decor", { paid: 12_000_001, balanceDue: null, note: "" })).toThrow(DomainError);
  });

  it("stores team notes up to 2,000 characters", () => {
    expect(setTeamNotes(plan, "Call the decorator on Monday.").teamNotes).toBe("Call the decorator on Monday.");
    expect(() => setTeamNotes(plan, "x".repeat(2001))).toThrow(DomainError);
  });
});

describe("moodboard limits (EM-67)", () => {
  const ok = { type: "image/png", size: 500_000, alt: "Marigold mandap" };
  it("accepts a JPEG, PNG or WebP under 1 MB with alt text, up to 6 images", () => {
    expect(moodboardUploadError(ok, 5)).toBeNull();
    expect(moodboardUploadError({ ...ok, type: "image/webp", size: 1024 * 1024 - 1 }, 0)).toBeNull();
  });
  it.each([
    [{ ...ok }, 6, /up to 6 images/],
    [{ ...ok, type: "image/gif" }, 0, /JPEG, PNG or WebP/],
    [{ ...ok, size: 1024 * 1024 }, 0, /under 1 MB/],
    [{ ...ok, size: 0 }, 0, /empty/],
    [{ ...ok, alt: "   " }, 0, /Describe the image/],
    [{ ...ok, alt: "x".repeat(201) }, 0, /200 characters/],
  ])("refuses %o with %i images", (file, count, message) => {
    expect(moodboardUploadError(file, count)).toMatch(message);
  });
});
