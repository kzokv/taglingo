export type CurrencyCode =
  | "AUD"
  | "BRL"
  | "CAD"
  | "CHF"
  | "CNY"
  | "CZK"
  | "DKK"
  | "EUR"
  | "GBP"
  | "HKD"
  | "HUF"
  | "IDR"
  | "ILS"
  | "INR"
  | "ISK"
  | "JPY"
  | "KRW"
  | "MXN"
  | "MYR"
  | "NOK"
  | "NZD"
  | "PHP"
  | "PLN"
  | "RON"
  | "SEK"
  | "SGD"
  | "THB"
  | "TRY"
  | "TWD"
  | "USD"
  | "ZAR";

export interface Currency {
  code: CurrencyCode;
  name: string;
  aliases: readonly string[];
}

export const SOURCE_CURRENCIES = [
  { code: "USD", name: "US Dollar", aliases: ["dollar", "dólar", "美元"] },
  { code: "EUR", name: "Euro", aliases: ["euro", "歐元", "欧元"] },
  { code: "JPY", name: "Japanese Yen", aliases: ["yen", "円", "日圓", "日元"] },
  { code: "GBP", name: "British Pound", aliases: ["pound", "sterling", "英鎊"] },
  { code: "CNY", name: "Chinese Yuan", aliases: ["yuan", "renminbi", "人民币", "人民幣"] },
  { code: "KRW", name: "South Korean Won", aliases: ["won", "원", "韓元"] },
  { code: "TWD", name: "New Taiwan Dollar", aliases: ["taiwan dollar", "台幣", "新台幣"] },
  { code: "HKD", name: "Hong Kong Dollar", aliases: ["hong kong dollar", "港幣"] },
  { code: "AUD", name: "Australian Dollar", aliases: ["australian dollar", "澳幣"] },
  { code: "CAD", name: "Canadian Dollar", aliases: ["canadian dollar", "加幣"] },
  { code: "SGD", name: "Singapore Dollar", aliases: ["singapore dollar", "新幣"] },
  { code: "CHF", name: "Swiss Franc", aliases: ["franc", "瑞士法郎"] }
] as const satisfies readonly Currency[];

// Wayfinder verified this Frankfurter v2 catalog on 2026-07-30. Issue #19
// replaces this build-time catalog with the FX Gateway's authoritative view.
const ADDITIONAL_FRANKFURTER_TARGET_CURRENCIES = [
  { code: "BRL", name: "Brazilian Real", aliases: ["real", "real brasileiro"] },
  { code: "CZK", name: "Czech Koruna", aliases: ["koruna", "česká koruna"] },
  { code: "DKK", name: "Danish Krone", aliases: ["krone", "dansk krone"] },
  { code: "HUF", name: "Hungarian Forint", aliases: ["forint", "magyar forint"] },
  { code: "IDR", name: "Indonesian Rupiah", aliases: ["rupiah", "روبية"] },
  { code: "ILS", name: "Israeli New Shekel", aliases: ["shekel", "שקל"] },
  { code: "INR", name: "Indian Rupee", aliases: ["rupee", "रुपया"] },
  { code: "ISK", name: "Icelandic Króna", aliases: ["króna", "icelandic krona"] },
  { code: "MXN", name: "Mexican Peso", aliases: ["peso", "peso mexicano"] },
  { code: "MYR", name: "Malaysian Ringgit", aliases: ["ringgit", "ريڠݢيت"] },
  { code: "NOK", name: "Norwegian Krone", aliases: ["krone", "norsk krone"] },
  { code: "NZD", name: "New Zealand Dollar", aliases: ["new zealand dollar", "kiwi dollar"] },
  { code: "PHP", name: "Philippine Peso", aliases: ["peso", "pisong pilipino"] },
  { code: "PLN", name: "Polish Złoty", aliases: ["złoty", "zloty"] },
  { code: "RON", name: "Romanian Leu", aliases: ["leu", "leu românesc"] },
  { code: "SEK", name: "Swedish Krona", aliases: ["krona", "svensk krona"] },
  { code: "THB", name: "Thai Baht", aliases: ["baht", "บาท"] },
  { code: "TRY", name: "Turkish Lira", aliases: ["lira", "türk lirası"] },
  { code: "ZAR", name: "South African Rand", aliases: ["rand"] }
] as const satisfies readonly Currency[];

export const TARGET_CURRENCIES: readonly Currency[] = [
  ...SOURCE_CURRENCIES,
  ...ADDITIONAL_FRANKFURTER_TARGET_CURRENCIES
].sort((left, right) => left.code.localeCompare(right.code));

const normalizeSearchText = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export function searchTargetCurrencies(query: string): readonly Currency[] {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return TARGET_CURRENCIES;
  }

  return TARGET_CURRENCIES.filter((currency) =>
    [currency.code, currency.name, ...currency.aliases].some((value) =>
      normalizeSearchText(value).includes(normalizedQuery)
    )
  );
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return (
    typeof value === "string" &&
    TARGET_CURRENCIES.some(({ code }) => code === value)
  );
}
