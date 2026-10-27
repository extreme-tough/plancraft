"use client";

import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseAmount } from "@/domain/amount-parser";
import { formatMoneyCompact } from "@/domain/format";
import { isSupportedCurrency } from "@/domain/money";
import { describedBy, type ControlAria } from "./form-field";

function currencySymbol(currency: string, locale: string): string {
  return (
    new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currency
  );
}

/**
 * An amount typed the way people say it ("15 lakh", "€8.000", "15k"), read back before it is used
 * (EM-38 c): "Understood as ₹15,00,000", announced politely as the value changes. Quick picks fill
 * in the same kind of text, so they go through the same parser.
 */
export function AmountField({
  aria,
  value,
  onChange,
  onBlur,
  currency,
  locale,
  suggestions,
}: {
  aria: ControlAria;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  currency: string;
  locale: string;
  suggestions: readonly string[];
}): React.ReactElement {
  const parsedId = `${aria.id}-parsed`;
  const known = isSupportedCurrency(currency);
  const read = (text: string) => (known ? parseAmount(text, currency, locale) : null);
  const parsed = value.trim() !== "" ? read(value) : null;
  const minor = parsed?.kind === "ok" && parsed.minor > 0 ? parsed.minor : null;
  const symbol = known ? currencySymbol(currency, locale) : null;

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="relative w-full">
        {symbol && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 start-3 z-10 flex items-center font-semibold text-muted-foreground"
          >
            {symbol}
          </span>
        )}
        <Input
          {...aria}
          aria-describedby={describedBy(minor !== null && parsedId, aria["aria-describedby"])}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          inputMode="decimal"
          autoComplete="off"
          size="lg"
          placeholder="For example 8 lakh or 15k"
          style={symbol ? { paddingInlineStart: `calc(1.25rem + ${symbol.length}ch)` } : undefined}
        />
      </div>

      <div aria-live="polite">
        {minor !== null && (
          <p
            id={parsedId}
            className="flex items-start gap-2 rounded-xl border border-primary/24 bg-accent px-3 py-2.5 font-semibold text-accent-foreground text-sm"
          >
            <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Understood as {formatMoneyCompact(minor, currency, locale)}
          </p>
        )}
      </div>

      {known && suggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p id={`${aria.id}-picks`} className="text-muted-foreground text-sm">
            Quick picks
          </p>
          <div role="group" aria-labelledby={`${aria.id}-picks`} className="flex flex-wrap gap-2">
            {suggestions.map((text) => {
              const pick = read(text);
              if (pick?.kind !== "ok") return null;
              const pressed = minor === pick.minor;
              return (
                <Button
                  key={text}
                  size="sm"
                  variant={pressed ? "default" : "outline"}
                  aria-pressed={pressed}
                  className="rounded-full"
                  onClick={() => onChange(text)}
                >
                  {formatMoneyCompact(pick.minor, currency, locale)}
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
