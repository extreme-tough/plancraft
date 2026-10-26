import { minorToMajor, type Minor } from "./money";

/**
 * Formats minor units for display in the user's locale (EM-37), e.g. ₹8,00,000.00 in en-IN,
 * 8.000,00 € in de-DE. Formatting happens only at the edge; stored values stay integers.
 */
export function formatMoney(minor: Minor, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minorToMajor(minor, currency));
}

/** The same, without trailing zero decimals: ₹8,00,000 rather than ₹8,00,000.00. */
export function formatMoneyCompact(minor: Minor, currency: string, locale: string): string {
  const major = minorToMajor(minor, currency);
  const whole = Number.isInteger(major);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : undefined,
    maximumFractionDigits: whole ? 0 : undefined,
  }).format(major);
}
