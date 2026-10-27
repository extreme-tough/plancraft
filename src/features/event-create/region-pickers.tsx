"use client";

import { useMemo, useState } from "react";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@/components/ui/combobox";
import { COUNTRY_CODES } from "@/domain/regions";
import { countryName, currencyName } from "@/lib/display-names";
import type { ControlAria } from "./form-field";

interface PickerProps {
  aria: ControlAria;
  value: string;
  onChange: (code: string) => void;
  onBlur?: () => void;
  placeholder: string;
  items: readonly string[];
  /** How each option reads in the list and in search. */
  label: (code: string) => string;
  /** What the input shows once picked; defaults to `label`. */
  inputLabel?: (code: string) => string;
  empty: string;
  className?: string;
}

/**
 * Best matches first, so typing "india" then Enter picks India rather than British Indian Ocean
 * Territory: exact code, then name prefix, then word prefix, then anywhere in the name.
 */
export function rankMatches(items: readonly string[], label: (code: string) => string, query: string): string[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...items];
  const scored: Array<[number, string]> = [];
  for (const code of items) {
    const text = label(code).toLowerCase();
    let score = -1;
    if (code.toLowerCase() === q) score = 0;
    else if (text.startsWith(q)) score = 1;
    else if (text.split(/[\s·(),&-]+/).some((word) => word.startsWith(q))) score = 2;
    else if (text.includes(q)) score = 3;
    if (score >= 0) scored.push([score, code]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map(([, code]) => code);
}

/** Type-to-filter list of codes (coss Combobox on Base UI: keyboard and screen-reader support built in). */
function CodePicker({
  aria,
  value,
  onChange,
  onBlur,
  placeholder,
  items,
  label,
  inputLabel = label,
  empty,
  className,
}: PickerProps): React.ReactElement {
  const [query, setQuery] = useState("");
  // Once a value is picked the input shows it; the list then shows everything again.
  const showAll = value !== "" && query === inputLabel(value);
  const filtered = useMemo(() => (showAll ? items : rankMatches(items, label, query)), [items, label, query, showAll]);

  return (
    <Combobox<string>
      items={items}
      filteredItems={filtered}
      filter={null}
      onInputValueChange={setQuery}
      value={value === "" ? null : value}
      onValueChange={(next) => onChange(next ?? "")}
      itemToStringLabel={inputLabel}
      autoHighlight
    >
      <ComboboxInput
        {...aria}
        placeholder={placeholder}
        onBlur={onBlur}
        className={className}
        autoComplete="off"
        // The chevron is mouse-only (tabindex -1), but axe still requires it to have a name.
        triggerProps={{ "aria-label": "Show all options" }}
      />
      <ComboboxPopup>
        <ComboboxEmpty>{empty}</ComboboxEmpty>
        <ComboboxList>
          {(code: string) => (
            <ComboboxItem key={code} value={code}>
              {label(code)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}

type PresetProps = Omit<PickerProps, "items" | "label" | "inputLabel" | "empty" | "placeholder">;

/** EM-01: ISO 3166-1 alpha-2, shown by name. */
export function CountryPicker(props: PresetProps): React.ReactElement {
  const items = useMemo(
    () => [...COUNTRY_CODES].sort((a, b) => countryName(a).localeCompare(countryName(b), "en")),
    [],
  );
  return <CodePicker {...props} items={items} label={countryName} placeholder="Type to search" empty="No country matches." />;
}

const currencyLabel = (code: string): string => `${code} · ${currencyName(code)}`;

const currencyCode = (code: string): string => code;

/**
 * EM-37: one ISO 4217 currency per event, from Intl.supportedValuesOf('currency'). The list shows
 * names; the picked value shows as its code, so the picker fits the budget card's header.
 */
export function CurrencyPicker(props: PresetProps): React.ReactElement {
  const items = useMemo(() => Intl.supportedValuesOf("currency"), []);
  return (
    <CodePicker
      {...props}
      items={items}
      label={currencyLabel}
      inputLabel={currencyCode}
      placeholder="Code"
      empty="No currency matches."
    />
  );
}
