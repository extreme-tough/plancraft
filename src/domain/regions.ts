/**
 * Countries for an event's location (EM-01): ISO 3166-1 alpha-2 codes. Names are shown at the edge
 * with Intl.DisplayNames, so the list is codes only.
 */
export const COUNTRY_CODES: readonly string[] = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS " +
  "BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE " +
  "EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM " +
  "HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC " +
  "LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA " +
  "NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO " +
  "TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

const COUNTRY_SET = new Set(COUNTRY_CODES);

export function isCountryCode(code: string): boolean {
  return COUNTRY_SET.has(code);
}

const EURO_AREA = "AD AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MC ME MT NL PT SI SK SM VA".split(" ");

/**
 * The usual currency for a country, used only to pre-fill the currency field once a country is
 * picked. The user can always choose another (EM-37). Countries not listed get no suggestion.
 */
const COUNTRY_CURRENCY: Readonly<Record<string, string>> = {
  ...Object.fromEntries(EURO_AREA.map((code) => [code, "EUR"])),
  AE: "AED", AR: "ARS", AU: "AUD", BD: "BDT", BH: "BHD", BR: "BRL", CA: "CAD", CH: "CHF", CL: "CLP",
  CN: "CNY", CO: "COP", CZ: "CZK", DK: "DKK", EG: "EGP", GB: "GBP", GH: "GHS", HK: "HKD", HU: "HUF",
  ID: "IDR", IL: "ILS", IN: "INR", JO: "JOD", JP: "JPY", KE: "KES", KR: "KRW", KW: "KWD", LK: "LKR",
  MA: "MAD", MX: "MXN", MY: "MYR", NG: "NGN", NO: "NOK", NP: "NPR", NZ: "NZD", OM: "OMR", PE: "PEN",
  PH: "PHP", PK: "PKR", PL: "PLN", QA: "QAR", RO: "RON", SA: "SAR", SE: "SEK", SG: "SGD", TH: "THB",
  TR: "TRY", TW: "TWD", TZ: "TZS", UA: "UAH", UG: "UGX", US: "USD", VN: "VND", ZA: "ZAR",
};

export function suggestedCurrency(country: string): string | null {
  return COUNTRY_CURRENCY[country] ?? null;
}
