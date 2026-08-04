import type { SourceCurrencyCode } from "./currencies";

export interface CurrencyNotationRules {
  readonly separators: {
    readonly decimal: "." | ",";
    readonly grouping: string;
    readonly displayGrouping: string;
  };
  readonly groupingStyle: "western" | "indian";
  readonly markers: readonly string[];
  readonly examples: {
    readonly amount: string;
    readonly marked: string;
  };
}

function rules({
  decimal,
  grouping,
  displayGrouping = grouping,
  markers,
  amount,
  marked,
  groupingStyle = "western"
}: {
  decimal: "." | ",";
  grouping: string;
  displayGrouping?: string;
  markers: readonly string[];
  amount: string;
  marked: string;
  groupingStyle?: "western" | "indian";
}): CurrencyNotationRules {
  return {
    separators: { decimal, grouping, displayGrouping },
    groupingStyle,
    markers,
    examples: { amount, marked }
  };
}

export const CURRENCY_NOTATION_RULES = {
  AUD: rules({ decimal: ".", grouping: ",", markers: ["AUD", "A$", "AU$", "$"], amount: "1,234.56", marked: "A$1,234.56" }),
  BRL: rules({ decimal: ",", grouping: ".", markers: ["BRL", "R$"], amount: "1.234,56", marked: "R$ 1.234,56" }),
  CAD: rules({ decimal: ".", grouping: ",", markers: ["CAD", "C$", "CA$", "$"], amount: "1,234.56", marked: "C$1,234.56" }),
  CHF: rules({ decimal: ".", grouping: "'", displayGrouping: "’", markers: ["CHF", "SFr.", "Fr."], amount: "1’234.56", marked: "CHF 1’234.56" }),
  CNY: rules({ decimal: ".", grouping: ",", markers: ["CNY", "RMB", "RMB¥", "CN¥", "¥", "元"], amount: "1,234.56", marked: "¥1,234.56" }),
  CZK: rules({ decimal: ",", grouping: " ", markers: ["CZK", "Kč"], amount: "1 234,56", marked: "1 234,56 Kč" }),
  DKK: rules({ decimal: ",", grouping: ".", markers: ["DKK", "kr.", "kr"], amount: "1.234,56", marked: "1.234,56 kr." }),
  EUR: rules({ decimal: ",", grouping: ".", markers: ["EUR", "€"], amount: "1.234,56", marked: "€1.234,56" }),
  GBP: rules({ decimal: ".", grouping: ",", markers: ["GBP", "£"], amount: "1,234.56", marked: "£1,234.56" }),
  HKD: rules({ decimal: ".", grouping: ",", markers: ["HKD", "HK$", "$"], amount: "1,234.56", marked: "HK$1,234.56" }),
  HUF: rules({ decimal: ",", grouping: " ", markers: ["HUF", "Ft"], amount: "1 234", marked: "1 234 Ft" }),
  IDR: rules({ decimal: ",", grouping: ".", markers: ["IDR", "Rp"], amount: "1.234", marked: "Rp 1.234" }),
  ILS: rules({ decimal: ".", grouping: ",", markers: ["ILS", "₪"], amount: "1,234.56", marked: "₪1,234.56" }),
  INR: rules({ decimal: ".", grouping: ",", groupingStyle: "indian", markers: ["INR", "₹", "Rs", "Rs."], amount: "1,23,456.78", marked: "₹1,23,456.78" }),
  ISK: rules({ decimal: ",", grouping: ".", markers: ["ISK", "kr.", "kr"], amount: "1.234", marked: "1.234 kr." }),
  JPY: rules({ decimal: ".", grouping: ",", markers: ["JPY", "¥", "円"], amount: "1,234", marked: "¥1,234" }),
  KRW: rules({ decimal: ".", grouping: ",", markers: ["KRW", "₩", "원"], amount: "1,234", marked: "₩1,234" }),
  MXN: rules({ decimal: ".", grouping: ",", markers: ["MXN", "MX$", "Mex$", "$"], amount: "1,234.56", marked: "MX$1,234.56" }),
  MYR: rules({ decimal: ".", grouping: ",", markers: ["MYR", "RM"], amount: "1,234.56", marked: "RM 1,234.56" }),
  NOK: rules({ decimal: ",", grouping: " ", markers: ["NOK", "kr"], amount: "1 234,56", marked: "1 234,56 kr" }),
  NZD: rules({ decimal: ".", grouping: ",", markers: ["NZD", "NZ$", "$"], amount: "1,234.56", marked: "NZ$1,234.56" }),
  PHP: rules({ decimal: ".", grouping: ",", markers: ["PHP", "₱"], amount: "1,234.56", marked: "₱1,234.56" }),
  PLN: rules({ decimal: ",", grouping: " ", markers: ["PLN", "zł"], amount: "1 234,56", marked: "1 234,56 zł" }),
  RON: rules({ decimal: ",", grouping: ".", markers: ["RON", "lei", "leu"], amount: "1.234,56", marked: "1.234,56 lei" }),
  SEK: rules({ decimal: ",", grouping: " ", markers: ["SEK", "kr"], amount: "1 234,56", marked: "1 234,56 kr" }),
  SGD: rules({ decimal: ".", grouping: ",", markers: ["SGD", "S$", "$"], amount: "1,234.56", marked: "S$1,234.56" }),
  THB: rules({ decimal: ".", grouping: ",", markers: ["THB", "฿", "บาท"], amount: "1,234.56", marked: "฿1,234.56" }),
  TRY: rules({ decimal: ",", grouping: ".", markers: ["TRY", "₺", "TL"], amount: "1.234,56", marked: "₺1.234,56" }),
  TWD: rules({ decimal: ".", grouping: ",", markers: ["TWD", "NT$", "NTD", "$"], amount: "1,234.56", marked: "NT$1,234.56" }),
  USD: rules({ decimal: ".", grouping: ",", markers: ["USD", "US$", "$"], amount: "1,234.56", marked: "$1,234.56" }),
  ZAR: rules({ decimal: ",", grouping: " ", markers: ["ZAR", "R"], amount: "1 234,56", marked: "R 1 234,56" })
} as const satisfies Record<SourceCurrencyCode, CurrencyNotationRules>;

export function getCurrencyNotationRules(
  currency: SourceCurrencyCode
): CurrencyNotationRules {
  return CURRENCY_NOTATION_RULES[currency];
}
