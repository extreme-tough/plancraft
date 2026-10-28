/**
 * UX-10: three pasted sample quotes for the demo persona's catering line. They are user **inputs**
 * (AI-07 allows them), read by the live AI like any pasted quote. Each one shows a check: a hidden
 * charge (EM-49), unclear tax (EM-51) and a different currency (EM-50). The vendors are made up.
 */
export interface SampleQuote {
  key: "hidden-charge" | "unclear-tax" | "other-currency";
  /** Button text. */
  title: string;
  text: string;
}

export const SAMPLE_QUOTES: readonly SampleQuote[] = [
  {
    key: "hidden-charge",
    title: "Hidden charge",
    text: `Saffron Table Caterers, Jaipur
Quotation for wedding dinner, 150 guests

1. Vegetarian Rajasthani thali dinner: 150 plates x ₹950 = ₹1,42,500
2. Welcome drinks and snacks: 150 x ₹180 = ₹27,000
3. Service staff (20 stewards and 2 captains): ₹18,000
4. GST at 5%: ₹9,375

Grand total: ₹2,06,875

All dishes are vegetarian and labelled at the buffet. Crockery and cutlery included.
Not included: decoration, tables and chairs.
Service ends at 11 pm; overtime is charged extra.
Valid until 15 December 2026.`,
  },
  {
    key: "unclear-tax",
    title: "Unclear tax",
    text: `MARWAR KITCHEN CO.
Wedding catering estimate

Rates for 140 guests.
Rajasthani thali (dal baati churma, gatte ki sabzi, ker sangri): ₹1,100 per plate, 140 plates = ₹1,54,000
Live chaat counter: ₹15,000
Kulfi and paan station: ₹8,000

Total: ₹1,77,000. Taxes as applicable.

Includes cooks, servers and serving equipment.
50% advance to book the date. Prices may change if the menu changes.`,
  },
  {
    key: "other-currency",
    title: "Different currency",
    text: `Silver Spoon Global Catering
Proposal in US dollars (USD)

Plated vegetarian dinner, 150 guests at $14.00 each: $2,100.00
Service and set-up fee: $380.00
Sales tax: included

Total due: USD 2,480.00

Includes clearly labelled vegetarian and vegan options, linen and staff.
Excludes travel for staff outside the city limits.`,
  },
];
