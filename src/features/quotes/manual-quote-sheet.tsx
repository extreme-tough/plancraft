"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { amountErrorMessage, parseAmount } from "@/domain/amount-parser";
import { isIsoDate } from "@/domain/dates";
import { parseGuestCount } from "@/domain/event-input";
import { minorToMajor, type Minor } from "@/domain/money";
import type { QuoteDetails, QuoteItem } from "@/domain/quote";
import type { BudgetLine, EventPlan } from "@/domain/schemas";
import { NativeSelect } from "@/features/dashboard/native-select";
import { AmountField } from "@/features/event-create/amount-field";
import { FieldErrorText, FormField } from "@/features/event-create/form-field";
import { currencyName } from "@/lib/display-names";

type Status = QuoteDetails["needsCoverage"][number]["status"];

interface Draft {
  vendorName: string;
  currency: string;
  base: string;
  fees: string;
  taxes: string;
  discount: string;
  statedTotal: string;
  taxTreatment: QuoteDetails["taxTreatment"];
  guestsCovered: string;
  inclusions: string;
  exclusions: string;
  needs: Record<string, Status>;
  validUntil: string;
}

function draftFrom(details: QuoteDetails | null, line: BudgetLine, plan: EventPlan): Draft {
  const currency = details?.currency ?? plan.currency;
  const total = (kind: QuoteItem["kind"]): string => {
    const items = details?.items.filter((item) => item.kind === kind) ?? [];
    if (items.length === 0) return "";
    return String(Math.abs(minorToMajor(items.reduce((sum, item) => sum + item.amount, 0), currency)));
  };
  const coverage = new Map(details?.needsCoverage.map((entry) => [entry.need, entry.status]));
  return {
    vendorName: details?.vendorName ?? "",
    currency,
    base: total("item"),
    fees: total("fee"),
    taxes: total("tax"),
    discount: total("discount"),
    statedTotal: !details || details.statedTotal === null ? "" : String(minorToMajor(details.statedTotal, currency)),
    taxTreatment: details?.taxTreatment ?? "unclear",
    guestsCovered: details?.guestsCovered ? String(details.guestsCovered) : "",
    inclusions: details?.inclusions.join("\n") ?? "",
    exclusions: details?.exclusions.join("\n") ?? "",
    needs: Object.fromEntries(line.vendorNeeds.map((need) => [need, coverage.get(need) ?? "not_mentioned"])),
    validUntil: details?.validUntil && isIsoDate(details.validUntil) ? details.validUntil : "",
  };
}

const lines = (text: string): string[] =>
  text
    .split("\n")
    .map((item) => item.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 15);

const STATUS_TEXT: Record<Status, string> = { covered: "Covered", not_covered: "Not covered", not_mentioned: "Not mentioned" };

/**
 * "Enter details manually" (spec §7.6): the same fields the AI fills, for when it can't read a quote
 * or read it wrong. The EM-49 to EM-51 checks run on these entries too.
 */
export function ManualQuoteSheet({
  details,
  line,
  plan,
  locale,
  open,
  onOpenChange,
  onSave,
}: {
  details: QuoteDetails | null;
  line: BudgetLine;
  plan: EventPlan;
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (details: QuoteDetails) => Promise<boolean>;
}): React.ReactElement {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(details, line, plan));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>): void => setDraft((d) => ({ ...d, ...patch }));
  const currencies = [plan.currency, ...Intl.supportedValuesOf("currency").filter((code) => code !== plan.currency)];

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const next: Record<string, string> = {};
    const money = (field: "base" | "fees" | "taxes" | "discount" | "statedTotal"): Minor | null => {
      if (draft[field].trim() === "") return null;
      const parsed = parseAmount(draft[field], draft.currency, locale);
      if (parsed.kind === "error") {
        next[field] = amountErrorMessage(parsed, draft.currency);
        return null;
      }
      return parsed.minor;
    };
    const amounts = { base: money("base"), fees: money("fees"), taxes: money("taxes"), discount: money("discount"), statedTotal: money("statedTotal") };
    const guests = draft.guestsCovered.trim() === "" ? null : parseGuestCount(draft.guestsCovered);
    if (draft.guestsCovered.trim() !== "" && (guests === null || guests < 1 || guests > 100_000)) next.guestsCovered = "Enter a whole number of guests.";
    if (Object.values(amounts).every((value) => value === null)) next.base = "Enter at least a price or a total.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const item = (description: string, kind: QuoteItem["kind"], amount: Minor | null): QuoteItem[] =>
      amount === null ? [] : [{ description, kind, quantity: null, unitPrice: null, amount: kind === "discount" ? -amount : amount }];
    setBusy(true);
    const saved = await onSave({
      vendorName: draft.vendorName.trim().slice(0, 100) || null,
      currency: draft.currency,
      items: [
        ...item("Price before tax and fees", "item", amounts.base),
        ...item("Fees", "fee", amounts.fees),
        ...item("Tax", "tax", amounts.taxes),
        ...item("Discount", "discount", amounts.discount),
      ],
      statedTotal: amounts.statedTotal,
      taxTreatment: draft.taxTreatment,
      guestsCovered: guests,
      inclusions: lines(draft.inclusions),
      exclusions: lines(draft.exclusions),
      needsCoverage: Object.entries(draft.needs).map(([need, status]) => ({ need, status })),
      clarifications: details?.clarifications ?? [],
      validUntil: draft.validUntil || null,
    }).finally(() => setBusy(false));
    if (saved) onOpenChange(false);
  };

  const amountField = (field: "base" | "fees" | "taxes" | "discount" | "statedTotal", label: string, hint?: string): React.ReactElement => (
    <FormField id={`manual-${field}`} label={label} error={errors[field]} hint={hint}>
      {(aria) => <AmountField aria={aria} value={draft[field]} currency={draft.currency} locale={locale} suggestions={[]} onChange={(value) => set({ [field]: value })} />}
    </FormField>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup>
        <form onSubmit={(e) => void submit(e)} className="flex h-full min-h-0 flex-col" noValidate>
          <SheetHeader>
            <SheetTitle className="pe-8">{details ? "Correct the quote's details" : "Enter the quote's details"}</SheetTitle>
            <SheetDescription>Copy what the quote says. Leave anything it doesn&apos;t state empty; it shows as &quot;Not stated&quot;.</SheetDescription>
          </SheetHeader>
          <SheetPanel className="flex flex-col gap-5">
            <FormField id="manual-vendor" label="Vendor name">
              {(aria) => <Input {...aria} value={draft.vendorName} maxLength={100} onChange={(e) => set({ vendorName: e.target.value })} />}
            </FormField>
            <FormField id="manual-currency" label="Currency of the quote">
              {(aria) => (
                <NativeSelect {...aria} value={draft.currency} onChange={(e) => set({ currency: e.target.value })}>
                  {currencies.map((code) => (
                    <option key={code} value={code}>
                      {code} · {currencyName(code)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            {amountField("base", "Price before tax and fees")}
            {amountField("fees", "Fees and service charges")}
            {amountField("taxes", "Tax")}
            {amountField("discount", "Discount")}
            {amountField("statedTotal", "Total the quote states", "Leave empty if the quote gives no total.")}

            <fieldset className="flex flex-col gap-2">
              <legend id="manual-tax-legend" className="mb-2 font-medium text-sm">
                Does the price include tax?
              </legend>
              <RadioGroup
                value={draft.taxTreatment}
                onValueChange={(value) => set({ taxTreatment: value as Draft["taxTreatment"] })}
                aria-labelledby="manual-tax-legend"
                className="flex flex-row flex-wrap gap-4"
              >
                {(["included", "excluded", "unclear"] as const).map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <Radio value={value} />
                    {value === "included" ? "Included" : value === "excluded" ? "Extra" : "Not clear"}
                  </label>
                ))}
              </RadioGroup>
            </fieldset>

            <FormField id="manual-guests" label="Guests the price covers" error={errors.guestsCovered}>
              {(aria) => <Input {...aria} inputMode="numeric" className="max-w-32" value={draft.guestsCovered} onChange={(e) => set({ guestsCovered: e.target.value })} />}
            </FormField>
            <FormField id="manual-inclusions" label="Included" hint="One per line.">
              {(aria) => <Textarea {...aria} rows={3} value={draft.inclusions} onChange={(e) => set({ inclusions: e.target.value })} />}
            </FormField>
            <FormField id="manual-exclusions" label="Excluded or left to you" hint="One per line.">
              {(aria) => <Textarea {...aria} rows={3} value={draft.exclusions} onChange={(e) => set({ exclusions: e.target.value })} />}
            </FormField>
            {line.vendorNeeds.map((need, i) => (
              <FormField key={need} id={`manual-need-${i}`} label={`Need: ${need}`}>
                {(aria) => (
                  <NativeSelect {...aria} value={draft.needs[need]} onChange={(e) => set({ needs: { ...draft.needs, [need]: e.target.value as Status } })}>
                    {(Object.keys(STATUS_TEXT) as Status[]).map((status) => (
                      <option key={status} value={status}>
                        {STATUS_TEXT[status]}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
            ))}
            <FormField id="manual-valid-until" label="Valid until">
              {(aria) => <Input {...aria} type="date" className="max-w-48" value={draft.validUntil} onChange={(e) => set({ validUntil: e.target.value })} />}
            </FormField>
            <FieldErrorText id="manual-form" error={errors.form} />
          </SheetPanel>
          <SheetFooter className="flex-row justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save details
            </Button>
          </SheetFooter>
        </form>
      </SheetPopup>
    </Sheet>
  );
}
