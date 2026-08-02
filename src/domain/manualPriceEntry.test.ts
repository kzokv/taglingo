import { describe, expect, it } from "vitest";

import {
  SOURCE_CURRENCIES,
  type SourceCurrencyCode
} from "./currencies";
import { parseManualPriceEntry } from "./manualPriceEntry";

interface NotationFixture {
  currency: SourceCurrencyCode;
  amountOnly: string;
  markedInputs: readonly [string, string];
  expectedMinorUnits: number;
  expectedDisplay: string;
}

const NOTATION_MATRIX = [
  { currency: "AUD", amountOnly: "1,234.56", markedInputs: ["A$1,234.56", "1,234.56 AUD"], expectedMinorUnits: 123456, expectedDisplay: "1,234.56" },
  { currency: "BRL", amountOnly: "1.234,56", markedInputs: ["R$ 1.234,56", "1.234,56 BRL"], expectedMinorUnits: 123456, expectedDisplay: "1.234,56" },
  { currency: "CAD", amountOnly: "1,234.56", markedInputs: ["C$1,234.56", "1,234.56 CAD"], expectedMinorUnits: 123456, expectedDisplay: "1,234.56" },
  { currency: "CHF", amountOnly: "1'234.56", markedInputs: ["CHF 1’234.56", "1'234.56 Fr."], expectedMinorUnits: 123456, expectedDisplay: "1’234.56" },
  { currency: "CNY", amountOnly: "1,234.56", markedInputs: ["RMB 1,234.56", "1,234.56元"], expectedMinorUnits: 123456, expectedDisplay: "1,234.56" },
  { currency: "CZK", amountOnly: "1 234,56", markedInputs: ["CZK 1 234,56", "1 234,56 Kč"], expectedMinorUnits: 123456, expectedDisplay: "1 234,56" },
  { currency: "DKK", amountOnly: "1.234,56", markedInputs: ["DKK 1.234,56", "1.234,56 kr."], expectedMinorUnits: 123456, expectedDisplay: "1.234,56" },
  { currency: "EUR", amountOnly: "1.234,56", markedInputs: ["€１．２３４，５６", "1.234,56 EUR"], expectedMinorUnits: 123456, expectedDisplay: "1.234,56" },
  { currency: "GBP", amountOnly: "1,234.56", markedInputs: ["£1,234.56", "1,234.56 GBP"], expectedMinorUnits: 123456, expectedDisplay: "1,234.56" },
  { currency: "HKD", amountOnly: "1,234.56", markedInputs: ["HK$1,234.56", "1,234.56 HKD"], expectedMinorUnits: 123456, expectedDisplay: "1,234.56" },
  { currency: "HUF", amountOnly: "1 234", markedInputs: ["HUF 1 234", "1 234 Ft"], expectedMinorUnits: 1234, expectedDisplay: "1 234" },
  { currency: "IDR", amountOnly: "1.234", markedInputs: ["Rp 1.234", "1.234 IDR"], expectedMinorUnits: 1234, expectedDisplay: "1.234" },
  { currency: "ILS", amountOnly: "1,234.56", markedInputs: ["₪1,234.56", "1,234.56 ILS"], expectedMinorUnits: 123456, expectedDisplay: "1,234.56" },
  { currency: "INR", amountOnly: "1,23,456.78", markedInputs: ["₹1,23,456.78", "1,23,456.78 INR"], expectedMinorUnits: 12345678, expectedDisplay: "1,23,456.78" },
  { currency: "ISK", amountOnly: "1.234", markedInputs: ["ISK 1.234", "1.234 kr."], expectedMinorUnits: 1234, expectedDisplay: "1.234" },
  { currency: "JPY", amountOnly: "1,234", markedInputs: ["￥１，２３４", "1,234円"], expectedMinorUnits: 1234, expectedDisplay: "1,234" },
  { currency: "KRW", amountOnly: "1,234", markedInputs: ["₩1,234", "1,234원"], expectedMinorUnits: 1234, expectedDisplay: "1,234" },
  { currency: "MXN", amountOnly: "1,234.56", markedInputs: ["MX$1,234.56", "1,234.56 MXN"], expectedMinorUnits: 123456, expectedDisplay: "1,234.56" },
  { currency: "MYR", amountOnly: "1,234.56", markedInputs: ["RM 1,234.56", "1,234.56 MYR"], expectedMinorUnits: 123456, expectedDisplay: "1,234.56" },
  { currency: "NOK", amountOnly: "1 234,56", markedInputs: ["NOK 1 234,56", "1 234,56 kr"], expectedMinorUnits: 123456, expectedDisplay: "1 234,56" },
  { currency: "NZD", amountOnly: "1,234.56", markedInputs: ["NZ$1,234.56", "1,234.56 NZD"], expectedMinorUnits: 123456, expectedDisplay: "1,234.56" },
  { currency: "PHP", amountOnly: "1,234.56", markedInputs: ["₱1,234.56", "1,234.56 PHP"], expectedMinorUnits: 123456, expectedDisplay: "1,234.56" },
  { currency: "PLN", amountOnly: "1 234,56", markedInputs: ["PLN 1 234,56", "1 234,56 zł"], expectedMinorUnits: 123456, expectedDisplay: "1 234,56" },
  { currency: "RON", amountOnly: "1.234,56", markedInputs: ["RON 1.234,56", "1.234,56 lei"], expectedMinorUnits: 123456, expectedDisplay: "1.234,56" },
  { currency: "SEK", amountOnly: "1 234,56", markedInputs: ["SEK 1 234,56", "1 234,56 kr"], expectedMinorUnits: 123456, expectedDisplay: "1 234,56" },
  { currency: "SGD", amountOnly: "1,234.56", markedInputs: ["S$1,234.56", "1,234.56 SGD"], expectedMinorUnits: 123456, expectedDisplay: "1,234.56" },
  { currency: "THB", amountOnly: "1,234.56", markedInputs: ["฿1,234.56", "1,234.56 THB"], expectedMinorUnits: 123456, expectedDisplay: "1,234.56" },
  { currency: "TRY", amountOnly: "1.234,56", markedInputs: ["₺1.234,56", "1.234,56 TL"], expectedMinorUnits: 123456, expectedDisplay: "1.234,56" },
  { currency: "TWD", amountOnly: "1,234.56", markedInputs: ["NT$1,234.56", "1,234.56 TWD"], expectedMinorUnits: 123456, expectedDisplay: "1,234.56" },
  { currency: "USD", amountOnly: "1,234.56", markedInputs: ["$1,234.56", "1,234.56 USD"], expectedMinorUnits: 123456, expectedDisplay: "1,234.56" },
  { currency: "ZAR", amountOnly: "1 234,56", markedInputs: ["R 1 234,56", "1 234,56 ZAR"], expectedMinorUnits: 123456, expectedDisplay: "1 234,56" }
] as const satisfies readonly NotationFixture[];

const MALFORMED_GROUPING_MATRIX = [
  ["AUD", "12,34.56"],
  ["BRL", "12.34,56"],
  ["CAD", "12,34.56"],
  ["CHF", "12'34.56"],
  ["CNY", "12,34.56"],
  ["CZK", "12 34,56"],
  ["DKK", "12.34,56"],
  ["EUR", "12.34,56"],
  ["GBP", "12,34.56"],
  ["HKD", "12,34.56"],
  ["HUF", "12 34"],
  ["IDR", "12.34"],
  ["ILS", "12,34.56"],
  ["INR", "12,34,56.78"],
  ["ISK", "12.34"],
  ["JPY", "12,34"],
  ["KRW", "12,34"],
  ["MXN", "12,34.56"],
  ["MYR", "12,34.56"],
  ["NOK", "12 34,56"],
  ["NZD", "12,34.56"],
  ["PHP", "12,34.56"],
  ["PLN", "12 34,56"],
  ["RON", "12.34,56"],
  ["SEK", "12 34,56"],
  ["SGD", "12,34.56"],
  ["THB", "12,34.56"],
  ["TRY", "12.34,56"],
  ["TWD", "12,34.56"],
  ["USD", "12,34.56"],
  ["ZAR", "12 34,56"]
] as const satisfies ReadonlyArray<readonly [SourceCurrencyCode, string]>;

describe("Manual Price Entry", () => {
  it.each(NOTATION_MATRIX)(
    "accepts amount-only, prefix, and suffix notation for $currency",
    ({ currency, amountOnly, markedInputs, expectedMinorUnits, expectedDisplay }) => {
      for (const input of [amountOnly, ...markedInputs]) {
        expect(parseManualPriceEntry(currency, input), input).toEqual({
          ok: true,
          enteredPrice: {
            provenance: "entered",
            currency,
            minorUnits: expectedMinorUnits,
            displayAmount: expectedDisplay
          }
        });
      }
    }
  );

  it("has one notation fixture for every Source Currency", () => {
    expect(NOTATION_MATRIX.map(({ currency }) => currency).sort()).toEqual(
      SOURCE_CURRENCIES.map(({ code }) => code).sort()
    );
  });

  it.each(MALFORMED_GROUPING_MATRIX)(
    "rejects malformed $currency grouping in %s",
    (currency, input) => {
      const result = parseManualPriceEntry(currency, input);
      expect(result).toMatchObject({ ok: false, reason: "grouping" });
      if (!result.ok) {
        expect(result.message).toContain(currency);
      }
    }
  );

  it("rejects a zero-padded leading grouping", () => {
    expect(parseManualPriceEntry("USD", "0,123.45")).toMatchObject({
      ok: false,
      reason: "grouping"
    });
  });

  it.each(NOTATION_MATRIX)(
    "rejects a conflicting marker for $currency",
    ({ currency, amountOnly }) => {
      const conflictingCode = currency === "USD" ? "EUR" : "USD";
      expect(parseManualPriceEntry(currency, `${conflictingCode} ${amountOnly}`)).toMatchObject({
        ok: false,
        reason: "currency-marker"
      });
    }
  );

  it.each([
    ["USD", "12.345"],
    ["JPY", "12.00"],
    ["HUF", "12,00"]
  ] as const)(
    "rejects unsupported $currency precision in %s",
    (currency, input) => {
      expect(parseManualPriceEntry(currency, input)).toMatchObject({
        ok: false,
        reason: "precision"
      });
    }
  );

  it.each(["NaN", "Infinity", "-Infinity"])(
    "rejects non-finite input %s with actionable validation",
    (input) => {
      expect(parseManualPriceEntry("USD", input)).toEqual({
        ok: false,
        reason: "non-finite",
        message: "Enter a finite USD amount."
      });
    }
  );

  it("rejects values beyond safe exact minor units", () => {
    expect(parseManualPriceEntry("USD", "90071992547409.92")).toEqual({
      ok: false,
      reason: "out-of-range",
      message: "Enter a smaller USD amount."
    });
  });

  it("displays the largest accepted minor-unit value without rounding", () => {
    expect(parseManualPriceEntry("USD", "90071992547409.91")).toEqual({
      ok: true,
      enteredPrice: {
        provenance: "entered",
        currency: "USD",
        minorUnits: Number.MAX_SAFE_INTEGER,
        displayAmount: "90,071,992,547,409.91"
      }
    });
  });

  it("rejects empty and unsupported notation with actionable validation", () => {
    expect(parseManualPriceEntry("USD", " ")).toEqual({
      ok: false,
      reason: "empty",
      message: "Enter an amount to convert."
    });
    expect(parseManualPriceEntry("USD", "1e3")).toEqual({
      ok: false,
      reason: "invalid-format",
      message: "Enter a USD amount using its decimal and grouping separators."
    });
  });
});
