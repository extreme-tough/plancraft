import { currencyExponent, decimalStringToMinor, MAX_MINOR, type Minor } from "./money";

/**
 * Parses what people type into an amount field (EM-38): "8 lakh", "1.5 crore", "15k", "€8.000",
 * "$12,500", "Rs 8,00,000", "8.000,50". The caller always shows the result back before using it.
 */

export type AmountParseResult =
  | { kind: "ok"; minor: Minor }
  | { kind: "error"; code: AmountParseErrorCode; foundCurrency?: string };

export type AmountParseErrorCode =
  | "empty"
  | "invalid"
  | "negative"
  | "currency_mismatch"
  /** "8.000" in a three-decimal currency: eight thousand or eight? The field must ask. */
  | "ambiguous"
  | "too_large";

const MULTIPLIERS: ReadonlyMap<string, number> = new Map([
  ["k", 3],
  ["thousand", 3],
  ["l", 5],
  ["lac", 5],
  ["lacs", 5],
  ["lakh", 5],
  ["lakhs", 5],
  ["m", 6],
  ["mn", 6],
  ["million", 6],
  ["cr", 7],
  ["crore", 7],
  ["crores", 7],
]);

/** Written forms people use for a currency beyond its Intl symbols. */
const ALIASES: Readonly<Record<string, readonly string[]>> = {
  INR: ["rs", "rs."],
};

/** Symbols of other currencies, so "$500" in an INR event is a mismatch rather than gibberish. */
const FOREIGN_SYMBOLS: Readonly<Record<string, string>> = {
  "₹": "INR",
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₩": "KRW",
  "₽": "RUB",
  "₺": "TRY",
  "₦": "NGN",
  "₱": "PHP",
  "฿": "THB",
  "₫": "VND",
  "₪": "ILS",
  "د.إ": "AED",
};

const SYMBOL_LOCALES = ["en", "en-IN", "en-US", "de-DE", "ja-JP", "fr-FR"] as const;
const symbolCache = new Map<string, string[]>();

function normalize(text: string): string {
  // NFKC folds full-width ￥ to ¥ and no-break spaces to plain spaces.
  return text.normalize("NFKC").toLowerCase();
}

/** Every way Intl writes this currency, longest first so "us$" is removed before "$". */
function ownSymbols(currency: string, locale: string | undefined): string[] {
  const key = `${currency}|${locale ?? ""}`;
  const cached = symbolCache.get(key);
  if (cached) return cached;

  const symbols = new Set<string>([currency.toLowerCase(), ...(ALIASES[currency] ?? [])]);
  const locales = locale ? [locale, ...SYMBOL_LOCALES] : SYMBOL_LOCALES;
  for (const loc of locales) {
    for (const currencyDisplay of ["symbol", "narrowSymbol"] as const) {
      const part = new Intl.NumberFormat(loc, { style: "currency", currency, currencyDisplay })
        .formatToParts(1)
        .find((p) => p.type === "currency");
      if (part) symbols.add(normalize(part.value));
    }
  }
  const sorted = [...symbols].sort((a, b) => b.length - a.length);
  symbolCache.set(key, sorted);
  return sorted;
}

function stripOwnSymbols(text: string, currency: string, locale: string | undefined): string {
  let rest = text;
  for (const symbol of ownSymbols(currency, locale)) {
    // Letter-only symbols (codes, "rs") must stand alone, so "lakhs" never loses its "rs"-like parts.
    if (/^[a-z.]+$/.test(symbol)) {
      const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      rest = rest.replace(new RegExp(`(^|[^a-z])${escaped}(?![a-z])`, "g"), "$1 ");
    } else {
      rest = rest.split(symbol).join(" ");
    }
  }
  return rest;
}

/** Splits "8.000,50" style numbers into whole and fraction digits. */
function readNumber(
  raw: string,
  exponent: number,
): { whole: string; fraction: string } | "invalid" | "ambiguous" {
  // Spaces and apostrophes may only group thousands ("8 000", "1'250"), never join two numbers.
  const groups = raw.split(/[\s'_]+/);
  if (groups.slice(1).some((group) => !/^\d{3}(?:[.,]\d+)?$/.test(group))) return "invalid";
  const compact = groups.join("");
  if (!/^\d[\d.,]*$/.test(compact) || /[.,]$/.test(compact) || /[.,]{2}/.test(compact)) return "invalid";

  const lastDot = compact.lastIndexOf(".");
  const lastComma = compact.lastIndexOf(",");
  let decimalAt = -1;

  if (lastDot >= 0 && lastComma >= 0) {
    decimalAt = Math.max(lastDot, lastComma);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? "." : ",";
    const count = compact.split(separator).length - 1;
    const digitsAfter = compact.length - (lastDot >= 0 ? lastDot : lastComma) - 1;
    if (count === 1 && digitsAfter !== 3) decimalAt = lastDot >= 0 ? lastDot : lastComma;
    else if (count === 1 && digitsAfter === 3 && exponent === 3) return "ambiguous";
    // Otherwise every separator is grouping: "8,00,000", "8.000", "1,234,567".
  }

  const wholePart = decimalAt >= 0 ? compact.slice(0, decimalAt) : compact;
  const fraction = decimalAt >= 0 ? compact.slice(decimalAt + 1) : "";
  if (/[.,]/.test(fraction)) return "invalid";
  const whole = wholePart.replace(/[.,]/g, "");
  if (whole === "") return "invalid";
  return { whole, fraction };
}

/** Multiplies a decimal by 10^power on its digits: ("1", "5"), 7 → "15000000". */
function shift(whole: string, fraction: string, power: number): string {
  const moved = fraction.slice(0, power).padEnd(power, "0");
  const remaining = fraction.slice(power);
  const digits = (whole + moved).replace(/^0+(?=\d)/, "");
  return remaining ? `${digits}.${remaining}` : digits;
}

/** The field error for a failed parse (EM-38 d: never silently zero). */
export function amountErrorMessage(
  error: Extract<AmountParseResult, { kind: "error" }>,
  currency: string,
): string {
  switch (error.code) {
    case "empty":
      return "Enter an amount.";
    case "negative":
      return "The amount can't be negative.";
    case "currency_mismatch":
      // EM-38 (b): the wording comes from the spec.
      return `This event uses ${currency}. Currency conversion isn't supported.`;
    case "ambiguous":
      return `${currency} has three decimal places, so this could mean thousands or units. Type it without the separator, for example 8000.`;
    case "too_large":
      return "That amount is too large.";
    case "invalid":
      return "Enter a number, for example 800000, 8 lakh or 15k.";
  }
}

export function parseAmount(input: string, currency: string, locale?: string): AmountParseResult {
  const text = normalize(input).trim();
  if (text === "") return { kind: "error", code: "empty" };
  if (/^-|\(\s*\d/.test(text) || /\d\s*-$/.test(text)) return { kind: "error", code: "negative" };

  let rest = stripOwnSymbols(text, currency, locale);

  for (const [symbol, code] of Object.entries(FOREIGN_SYMBOLS)) {
    if (rest.includes(symbol)) return { kind: "error", code: "currency_mismatch", foundCurrency: code };
  }

  let power = 0;
  const words = rest.match(/[a-z]+\.?/g) ?? [];
  for (const word of words) {
    const bare = word.replace(/\.$/, "");
    const multiplier = MULTIPLIERS.get(bare);
    if (multiplier !== undefined && power === 0) {
      power = multiplier;
    } else if (bare.length === 3 && Intl.supportedValuesOf("currency").includes(bare.toUpperCase())) {
      return { kind: "error", code: "currency_mismatch", foundCurrency: bare.toUpperCase() };
    } else {
      return { kind: "error", code: "invalid" };
    }
    rest = rest.replace(word, " ");
  }

  if (/[^\d.,\s'_]/.test(rest)) return { kind: "error", code: "invalid" };
  const number = rest.trim();
  if (number === "") return { kind: "error", code: "invalid" };

  const exponent = currencyExponent(currency);
  const read = readNumber(number, exponent);
  if (read === "invalid" || read === "ambiguous") return { kind: "error", code: read };

  const minor = decimalStringToMinor(shift(read.whole, read.fraction, power), currency);
  if (minor > MAX_MINOR) return { kind: "error", code: "too_large" };
  return { kind: "ok", minor };
}
