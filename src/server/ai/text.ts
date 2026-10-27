/**
 * AI text hygiene (spec §7.2.6): every string is trimmed and stripped of control characters before
 * validation, so the length limits apply to what will actually be shown (always as text, never HTML).
 * Line breaks inside a value become spaces.
 */
const CONTROL = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;

export function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").replace(CONTROL, "").trim();
}

export function cleanStrings(value: unknown): unknown {
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) return value.map(cleanStrings);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, cleanStrings(inner)]));
  }
  return value;
}
