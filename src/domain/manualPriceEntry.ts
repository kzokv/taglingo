import {
  currencyFractionDigits,
  formatCurrencyMinorUnits,
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
      reason: "empty" | "invalid-format" | "precision" | "out-of-range";
      message: string;
    };

export function parseAmountOnlyEntry(
  currency: SourceCurrencyCode,
  input: string
): ManualPriceEntryResult {
  const amount = input.trim();
  if (!amount) {
    return {
      ok: false,
      reason: "empty",
      message: "Enter an amount to convert."
    };
  }

  const match = /^(\d+)(?:\.(\d+))?$/.exec(amount);
  if (!match) {
    return {
      ok: false,
      reason: "invalid-format",
      message: `Enter a plain ${currency} amount using digits and an optional decimal point.`
    };
  }

  const fractionDigits = currencyFractionDigits(currency);
  const fraction = match[2] ?? "";
  if (fraction.length > fractionDigits) {
    return {
      ok: false,
      reason: "precision",
      message:
        fractionDigits === 0
          ? `${currency} amounts must use whole units.`
          : `${currency} amounts can use at most ${fractionDigits} decimal places.`
    };
  }

  const scale = 10n ** BigInt(fractionDigits);
  const minorUnits =
    BigInt(match[1]) * scale + BigInt(fraction.padEnd(fractionDigits, "0") || "0");
  if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    return {
      ok: false,
      reason: "out-of-range",
      message: "Enter a smaller amount."
    };
  }

  const exactMinorUnits = Number(minorUnits);
  const displayAmount = formatCurrencyMinorUnits(minorUnits, currency);

  return {
    ok: true,
    enteredPrice: {
      provenance: "entered",
      currency,
      minorUnits: exactMinorUnits,
      displayAmount
    }
  };
}
