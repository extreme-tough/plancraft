"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { amountErrorMessage, parseAmount } from "@/domain/amount-parser";
import type { LineInput } from "@/domain/edits";
import { parseGuestCount } from "@/domain/event-input";
import { minorToMajor } from "@/domain/money";
import { CATEGORIES, type BudgetLine, type Category, type EventPlan } from "@/domain/schemas";
import { AmountField } from "@/features/event-create/amount-field";
import { FieldErrorText, FormField } from "@/features/event-create/form-field";
import { CATEGORY_TEXT } from "@/lib/display-names";
import { NativeSelect } from "./native-select";

export interface LineSave {
  input: LineInput;
  /** Wanted Confirmed state; null for a new line (new lines start as estimates). */
  confirmed: boolean | null;
}

interface Draft {
  name: string;
  category: Category;
  pricing: "flat" | "per_guest";
  amount: string;
  unitCost: string;
  guestSource: "event" | "own";
  ownGuests: string;
  confirmed: boolean;
}

function majorText(minor: number | null, currency: string): string {
  return minor === null || minor === 0 ? "" : String(minorToMajor(minor, currency));
}

function draftFrom(line: BudgetLine | null, currency: string): Draft {
  return {
    name: line?.name ?? "",
    category: line?.category ?? "other",
    pricing: line?.pricing ?? "flat",
    amount: line?.pricing === "flat" ? majorText(line.amount, currency) : "",
    unitCost: majorText(line?.unitCost ?? null, currency),
    guestSource: line?.guestSource ?? "event",
    ownGuests: line?.ownGuests ? String(line.ownGuests) : "",
    confirmed: line?.label === "confirmed",
  };
}

/**
 * Add or edit a budget line (EM-13, EM-16, EM-20, EM-43): name, category, flat or per-guest pricing,
 * and the Confirmed switch, which only the user can set. Amounts accept "15k", "2 lakh" and so on,
 * read back before saving (EM-38).
 */
export function LineSheet({
  plan,
  line,
  open,
  locale,
  busy,
  onOpenChange,
  onSave,
  onDelete,
}: {
  plan: EventPlan;
  /** null adds a new line. */
  line: BudgetLine | null;
  open: boolean;
  locale: string;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (save: LineSave) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}): React.ReactElement {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(line, plan.currency));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<Draft>): void => setDraft((d) => ({ ...d, ...patch }));
  const locked = line?.label === "confirmed" && draft.confirmed;

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (draft.name.trim() === "") next.name = "Enter a name for the line.";

    const money = (text: string, field: string): number => {
      if (text.trim() === "") return 0;
      const parsed = parseAmount(text, plan.currency, locale);
      if (parsed.kind === "error") {
        next[field] = amountErrorMessage(parsed, plan.currency);
        return 0;
      }
      return parsed.minor;
    };
    const amount = draft.pricing === "flat" ? money(draft.amount, "amount") : 0;
    const unitCost = draft.pricing === "per_guest" ? money(draft.unitCost, "unitCost") : 0;
    const ownGuests = draft.pricing === "per_guest" && draft.guestSource === "own" ? parseGuestCount(draft.ownGuests) : null;
    if (draft.pricing === "per_guest" && draft.guestSource === "own" && (ownGuests === null || ownGuests < 1 || ownGuests > 10_000)) {
      next.ownGuests = "Enter a whole number of guests between 1 and 10,000.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const saved = await onSave({
      input: { name: draft.name, category: draft.category, pricing: draft.pricing, amount, unitCost, guestSource: draft.guestSource, ownGuests },
      confirmed: line ? draft.confirmed : null,
    });
    if (saved) onOpenChange(false);
  };

  const title = line ? `Edit ${line.name}` : "Add a budget line";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup>
        <form onSubmit={(e) => void submit(e)} className="flex h-full min-h-0 flex-col" noValidate>
          <SheetHeader>
            <SheetTitle className="wrap-anywhere pe-8">{title}</SheetTitle>
            <SheetDescription>Totals and percentages update as soon as you save.</SheetDescription>
          </SheetHeader>
          <SheetPanel className="flex flex-col gap-5">
            <FormField id="line-name" label="Name" error={errors.name}>
              {(aria) => <Input {...aria} value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />}
            </FormField>

            <FormField id="line-category" label="Category">
              {(aria) => (
                <NativeSelect {...aria} value={draft.category} onChange={(e) => set({ category: e.target.value as Category })}>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {CATEGORY_TEXT[category]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>

            <fieldset className="flex flex-col gap-2" disabled={locked}>
              <legend id="line-pricing-legend" className="mb-2 font-medium text-sm">
                Pricing
              </legend>
              <RadioGroup
                value={draft.pricing}
                onValueChange={(next) => set({ pricing: next as Draft["pricing"] })}
                aria-labelledby="line-pricing-legend"
                className="flex flex-row flex-wrap gap-4"
                disabled={locked}
              >
                <label className="flex items-center gap-2 text-sm">
                  <Radio value="flat" />A fixed amount
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Radio value="per_guest" />A price per guest
                </label>
              </RadioGroup>
            </fieldset>

            {draft.pricing === "flat" ? (
              <FormField id="line-amount" label="Amount" error={errors.amount} hint={locked ? "Un-confirm the line to change its price." : undefined}>
                {(aria) => (
                  <AmountField aria={aria} value={draft.amount} currency={plan.currency} locale={locale} suggestions={[]} onChange={(amount) => set({ amount })} />
                )}
              </FormField>
            ) : (
              <>
                <FormField id="line-unit-cost" label="Price per guest" error={errors.unitCost} hint={locked ? "Un-confirm the line to change its price." : undefined}>
                  {(aria) => (
                    <AmountField aria={aria} value={draft.unitCost} currency={plan.currency} locale={locale} suggestions={[]} onChange={(unitCost) => set({ unitCost })} />
                  )}
                </FormField>
                <fieldset className="flex flex-col gap-2" disabled={locked}>
                  <legend id="line-guests-legend" className="mb-2 font-medium text-sm">
                    Guests
                  </legend>
                  <RadioGroup
                    value={draft.guestSource}
                    onValueChange={(next) => set({ guestSource: next as Draft["guestSource"] })}
                    aria-labelledby="line-guests-legend"
                    className="flex flex-col gap-2"
                    disabled={locked}
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <Radio value="event" />
                      Follow the event ({plan.guestCount.toLocaleString(locale)} guests)
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Radio value="own" />
                      Its own guest count
                    </label>
                  </RadioGroup>
                  {draft.guestSource === "own" && (
                    <FormField id="line-own-guests" label="Guests for this line" error={errors.ownGuests}>
                      {(aria) => <Input {...aria} inputMode="numeric" value={draft.ownGuests} onChange={(e) => set({ ownGuests: e.target.value })} className="max-w-32" />}
                    </FormField>
                  )}
                </fieldset>
              </>
            )}

            {line && (
              <div className="flex items-start justify-between gap-4 rounded-xl border p-3">
                <div>
                  <Label htmlFor="line-confirmed">Confirmed</Label>
                  <p id="line-confirmed-hint" className="text-muted-foreground text-sm">
                    You agreed this price with the vendor. The AI never changes confirmed lines.
                  </p>
                </div>
                <Switch
                  id="line-confirmed"
                  aria-describedby="line-confirmed-hint"
                  checked={draft.confirmed}
                  onCheckedChange={(confirmed) => set({ confirmed })}
                />
              </div>
            )}
            <FieldErrorText id="line-form" error={errors.form} />
          </SheetPanel>
          <SheetFooter className="flex-row flex-wrap justify-between gap-2">
            {line ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive-foreground"
                disabled={busy || line.label === "confirmed"}
                title={line.label === "confirmed" ? "Un-confirm the line before deleting it." : undefined}
                onClick={() => void onDelete().then((ok) => ok && onOpenChange(false))}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Save
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetPopup>
    </Sheet>
  );
}
