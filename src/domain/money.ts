/**
 * Money is an integer count of the currency's minor units (paise, cents, yen) (EM-37).
 * The exponent comes from ISO 4217 via Intl: JPY 0, INR 2, BHD 3. No floating-point money.
 */

export type Minor = number;

/** Largest amount the product accepts, in minor units (EM-01). Well inside Number.MAX_SAFE_INTEGER. */
export const MAX_MINOR = 10 ** 13;

const exponentCache = new Map<string, number>();

export function currencyExponent(currency: string): number {
  let exponent = exponentCache.get(currency);
  if (exponent === undefined) {
    exponent = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
    exponentCache.set(currency, exponent);
  }
  return exponent;
}

export function isSupportedCurrency(currency: string): boolean {
  return /^[A-Z]{3}$/.test(currency) && Intl.supportedValuesOf("currency").includes(currency);
}

export function isMinor(value: number): boolean {
  return Number.isSafeInteger(value) && Math.abs(value) <= MAX_MINOR;
}

/**
 * Converts a decimal string in major units ("1234.5") to minor units, rounding half up.
 * Exact: works on digits, never on binary floating point.
 */
export function decimalStringToMinor(decimal: string, currency: string): Minor {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(decimal);
  if (!match) throw new RangeError(`Not a non-negative decimal: ${decimal}`);
  const whole = match[1] ?? "0";
  const fraction = match[2] ?? "";
  const exponent = currencyExponent(currency);

  const kept = fraction.slice(0, exponent).padEnd(exponent, "0");
  const firstDropped = fraction.charAt(exponent);
  let minor = BigInt(whole + kept);
  if (firstDropped !== "" && Number(firstDropped) >= 5) minor += 1n;
  return Number(minor);
}

/** Converts a major-unit JSON number from the AI (e.g. 800000.5) to minor units, half up. */
export function majorNumberToMinor(major: number, currency: string): Minor {
  if (!Number.isFinite(major) || major < 0) throw new RangeError(`Not a non-negative amount: ${major}`);
  // toFixed(10) gives an exact decimal string for any realistic amount; then round on digits.
  return decimalStringToMinor(major.toFixed(10), currency);
}

/** Minor units back to a major-unit number, for display maths and AI payloads only. */
export function minorToMajor(minor: Minor, currency: string): number {
  return minor / 10 ** currencyExponent(currency);
}
