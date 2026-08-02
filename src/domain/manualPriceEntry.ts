import {
  currencyFractionDigits,
  type CurrencyAmount,
  type SourceCurrencyCode
} from "./currencies";

export interface EnteredPrice extends CurrencyAmount {
  provenance: "entered";
  currency: SourceCurrencyCode;
  displayAmount: string;
}

export type ManualPriceEntryResult =
  | { ok: true; enteredPrice: EnteredPrice }
  | {
      ok: false;
      reason:
        | "empty"
        | "invalid-format"
        | "currency-marker"
        | "grouping"
        | "precision"
        | "non-finite"
        | "out-of-range";
      message: string;
    };

interface CurrencyNotationProfile {
  separators: {
    decimal: "." | ",";
    grouping: string;
    displayGrouping: string;
  };
  groupingStyle: "western" | "indian";
  markers: readonly string[];
  examples: {
    amount: string;
    marked: string;
  };
}

const CURRENCY_NOTATION_PROFILES = {
  AUD: profile({ decimal: ".", grouping: ",", markers: ["AUD", "A$", "AU$", "$"], amount: "1,234.56", marked: "A$1,234.56" }),
  BRL: profile({ decimal: ",", grouping: ".", markers: ["BRL", "R$"], amount: "1.234,56", marked: "R$ 1.234,56" }),
  CAD: profile({ decimal: ".", grouping: ",", markers: ["CAD", "C$", "CA$", "$"], amount: "1,234.56", marked: "C$1,234.56" }),
  CHF: profile({ decimal: ".", grouping: "'", displayGrouping: "’", markers: ["CHF", "SFr.", "Fr."], amount: "1’234.56", marked: "CHF 1’234.56" }),
  CNY: profile({ decimal: ".", grouping: ",", markers: ["CNY", "RMB", "RMB¥", "CN¥", "¥", "元"], amount: "1,234.56", marked: "¥1,234.56" }),
  CZK: profile({ decimal: ",", grouping: " ", markers: ["CZK", "Kč"], amount: "1 234,56", marked: "1 234,56 Kč" }),
  DKK: profile({ decimal: ",", grouping: ".", markers: ["DKK", "kr.", "kr"], amount: "1.234,56", marked: "1.234,56 kr." }),
  EUR: profile({ decimal: ",", grouping: ".", markers: ["EUR", "€"], amount: "1.234,56", marked: "€1.234,56" }),
  GBP: profile({ decimal: ".", grouping: ",", markers: ["GBP", "£"], amount: "1,234.56", marked: "£1,234.56" }),
  HKD: profile({ decimal: ".", grouping: ",", markers: ["HKD", "HK$", "$"], amount: "1,234.56", marked: "HK$1,234.56" }),
  HUF: profile({ decimal: ",", grouping: " ", markers: ["HUF", "Ft"], amount: "1 234", marked: "1 234 Ft" }),
  IDR: profile({ decimal: ",", grouping: ".", markers: ["IDR", "Rp"], amount: "1.234", marked: "Rp 1.234" }),
  ILS: profile({ decimal: ".", grouping: ",", markers: ["ILS", "₪"], amount: "1,234.56", marked: "₪1,234.56" }),
  INR: profile({ decimal: ".", grouping: ",", groupingStyle: "indian", markers: ["INR", "₹", "Rs", "Rs."], amount: "1,23,456.78", marked: "₹1,23,456.78" }),
  ISK: profile({ decimal: ",", grouping: ".", markers: ["ISK", "kr.", "kr"], amount: "1.234", marked: "1.234 kr." }),
  JPY: profile({ decimal: ".", grouping: ",", markers: ["JPY", "¥", "円"], amount: "1,234", marked: "¥1,234" }),
  KRW: profile({ decimal: ".", grouping: ",", markers: ["KRW", "₩", "원"], amount: "1,234", marked: "₩1,234" }),
  MXN: profile({ decimal: ".", grouping: ",", markers: ["MXN", "MX$", "Mex$", "$"], amount: "1,234.56", marked: "MX$1,234.56" }),
  MYR: profile({ decimal: ".", grouping: ",", markers: ["MYR", "RM"], amount: "1,234.56", marked: "RM 1,234.56" }),
  NOK: profile({ decimal: ",", grouping: " ", markers: ["NOK", "kr"], amount: "1 234,56", marked: "1 234,56 kr" }),
  NZD: profile({ decimal: ".", grouping: ",", markers: ["NZD", "NZ$", "$"], amount: "1,234.56", marked: "NZ$1,234.56" }),
  PHP: profile({ decimal: ".", grouping: ",", markers: ["PHP", "₱"], amount: "1,234.56", marked: "₱1,234.56" }),
  PLN: profile({ decimal: ",", grouping: " ", markers: ["PLN", "zł"], amount: "1 234,56", marked: "1 234,56 zł" }),
  RON: profile({ decimal: ",", grouping: ".", markers: ["RON", "lei", "leu"], amount: "1.234,56", marked: "1.234,56 lei" }),
  SEK: profile({ decimal: ",", grouping: " ", markers: ["SEK", "kr"], amount: "1 234,56", marked: "1 234,56 kr" }),
  SGD: profile({ decimal: ".", grouping: ",", markers: ["SGD", "S$", "$"], amount: "1,234.56", marked: "S$1,234.56" }),
  THB: profile({ decimal: ".", grouping: ",", markers: ["THB", "฿", "บาท"], amount: "1,234.56", marked: "฿1,234.56" }),
  TRY: profile({ decimal: ",", grouping: ".", markers: ["TRY", "₺", "TL"], amount: "1.234,56", marked: "₺1.234,56" }),
  TWD: profile({ decimal: ".", grouping: ",", markers: ["TWD", "NT$", "NTD", "$"], amount: "1,234.56", marked: "NT$1,234.56" }),
  USD: profile({ decimal: ".", grouping: ",", markers: ["USD", "US$", "$"], amount: "1,234.56", marked: "$1,234.56" }),
  ZAR: profile({ decimal: ",", grouping: " ", markers: ["ZAR", "R"], amount: "1 234,56", marked: "R 1 234,56" })
} as const satisfies Record<SourceCurrencyCode, CurrencyNotationProfile>;

function profile({
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
}): CurrencyNotationProfile {
  return {
    separators: { decimal, grouping, displayGrouping },
    groupingStyle,
    markers,
    examples: { amount, marked }
  };
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[’‘]/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function matchesMarker(marker: string, profile: CurrencyNotationProfile): boolean {
  const normalizedMarker = normalize(marker).toLocaleUpperCase("en-US");
  return profile.markers.some(
    (compatibleMarker) =>
      normalize(compatibleMarker).toLocaleUpperCase("en-US") === normalizedMarker
  );
}

function validGroupedInteger(
  integer: string,
  profile: CurrencyNotationProfile
): boolean {
  const separator = profile.separators.grouping;
  if (!integer.includes(separator)) {
    return /^\d+$/u.test(integer);
  }

  const groups = integer.split(separator);
  if (groups.some((group) => !/^\d+$/u.test(group))) {
    return false;
  }

  const westernGrouping =
    /^[1-9]\d{0,2}$/u.test(groups[0]) &&
    groups.slice(1).every((group) => /^\d{3}$/u.test(group));
  if (profile.groupingStyle === "western" || westernGrouping) {
    return westernGrouping;
  }

  return (
    /^[1-9]\d?$/u.test(groups[0]) &&
    groups.length >= 2 &&
    groups.slice(1, -1).every((group) => /^\d{2}$/u.test(group)) &&
    /^\d{3}$/u.test(groups.at(-1) ?? "")
  );
}

function groupInteger(
  integer: string,
  profile: CurrencyNotationProfile
): string {
  if (profile.groupingStyle === "indian" && integer.length > 3) {
    const trailingGroup = integer.slice(-3);
    const leadingDigits = integer.slice(0, -3);
    const leadingGroups: string[] = [];
    for (let end = leadingDigits.length; end > 0; end -= 2) {
      leadingGroups.unshift(leadingDigits.slice(Math.max(0, end - 2), end));
    }
    return [...leadingGroups, trailingGroup].join(
      profile.separators.displayGrouping
    );
  }

  return integer.replace(
    /\B(?=(\d{3})+(?!\d))/gu,
    profile.separators.displayGrouping
  );
}

function formatLocalizedMinorUnits(
  minorUnits: bigint,
  currency: SourceCurrencyCode,
  profile: CurrencyNotationProfile
): string {
  const fractionDigits = currencyFractionDigits(currency);
  const digits = minorUnits.toString().padStart(fractionDigits + 1, "0");
  const integer = fractionDigits === 0 ? digits : digits.slice(0, -fractionDigits);
  const groupedInteger = groupInteger(integer, profile);

  return fractionDigits === 0
    ? groupedInteger
    : `${groupedInteger}${profile.separators.decimal}${digits.slice(-fractionDigits)}`;
}

export function getManualPriceEntryGuidance(currency: SourceCurrencyCode): {
  placeholder: string;
  message: string;
} {
  const profile = CURRENCY_NOTATION_PROFILES[currency];
  return {
    placeholder: profile.examples.amount,
    message: `Use ${profile.examples.amount} or ${profile.examples.marked}.`
  };
}

export function parseManualPriceEntry(
  currency: SourceCurrencyCode,
  input: string
): ManualPriceEntryResult {
  const normalizedInput = normalize(input);
  if (!normalizedInput) {
    return {
      ok: false,
      reason: "empty",
      message: "Enter an amount to convert."
    };
  }
  if (/^(?:[+-]?Infinity|NaN)$/iu.test(normalizedInput)) {
    return {
      ok: false,
      reason: "non-finite",
      message: `Enter a finite ${currency} amount.`
    };
  }

  const profile = CURRENCY_NOTATION_PROFILES[currency];
  const parts = /^([^\d]*)(\d(?:[\d.,' ]*\d)?)([^\d]*)$/u.exec(
    normalizedInput
  );
  if (!parts) {
    return {
      ok: false,
      reason: "invalid-format",
      message: `Enter a ${currency} amount using its decimal and grouping separators.`
    };
  }

  const prefix = parts[1].trim();
  const amount = parts[2];
  const suffix = parts[3].trim();
  if ((prefix && suffix) || (prefix && !matchesMarker(prefix, profile)) || (suffix && !matchesMarker(suffix, profile))) {
    return {
      ok: false,
      reason: "currency-marker",
      message:
        prefix && suffix
          ? `Use at most one matching ${currency} currency marker.`
          : `The currency marker does not match selected ${currency}.`
    };
  }

  const fractionDigits = currencyFractionDigits(currency);
  const decimalParts = amount.split(profile.separators.decimal);
  if (decimalParts.length > 2) {
    return {
      ok: false,
      reason: "invalid-format",
      message: `Use only one ${profile.separators.decimal} decimal separator for ${currency}.`
    };
  }

  const [integer, fraction] = decimalParts;
  if (fraction !== undefined && (fractionDigits === 0 || fraction.length > fractionDigits)) {
    return {
      ok: false,
      reason: "precision",
      message:
        fractionDigits === 0
          ? `${currency} amounts must use whole units.`
          : `${currency} amounts can use at most ${fractionDigits} decimal places.`
    };
  }
  if (fraction !== undefined && !/^\d+$/u.test(fraction)) {
    return {
      ok: false,
      reason: "invalid-format",
      message: `Enter digits after the ${currency} decimal separator.`
    };
  }
  if (!validGroupedInteger(integer, profile)) {
    return {
      ok: false,
      reason: "grouping",
      message: `Check the grouping separators in the ${currency} amount.`
    };
  }

  const normalizedInteger = integer.replaceAll(profile.separators.grouping, "");
  const scale = 10n ** BigInt(fractionDigits);
  const minorUnits =
    BigInt(normalizedInteger) * scale +
    BigInt((fraction ?? "").padEnd(fractionDigits, "0") || "0");
  if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    return {
      ok: false,
      reason: "out-of-range",
      message: `Enter a smaller ${currency} amount.`
    };
  }

  return {
    ok: true,
    enteredPrice: {
      provenance: "entered",
      currency,
      minorUnits: Number(minorUnits),
      displayAmount: formatLocalizedMinorUnits(minorUnits, currency, profile)
    }
  };
}
