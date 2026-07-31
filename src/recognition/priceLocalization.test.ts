import { describe, expect, it } from "vitest";

import type { SourceCurrencyCode } from "../domain/currencies";
import {
  localizePrices,
  type OcrToken
} from "./priceLocalization";

const BOX = { x: 12, y: 18, width: 108, height: 30 };

function token(text: string, confidence = 93): OcrToken {
  return { text, confidence, box: BOX };
}

const LOCALIZATION_MATRIX = [
  {
    currency: "USD",
    prefix: "$1,234.56",
    suffix: "1,234.56 USD",
    fullWidth: "＄１，２３４．５６",
    ambiguous: "$1,234.56",
    fraction: "$0.05",
    fractionMinorUnits: 5
  },
  {
    currency: "EUR",
    prefix: "€1.234,56",
    suffix: "1.234,56 EUR",
    fullWidth: "€１．２３４，５６",
    ambiguous: "€1.234,56",
    fraction: "€0,05",
    fractionMinorUnits: 5
  },
  {
    currency: "JPY",
    prefix: "¥1,234",
    suffix: "1,234円",
    fullWidth: "￥１，２３４",
    ambiguous: "¥1,234",
    fraction: "¥1,234.00",
    fractionMinorUnits: null
  },
  {
    currency: "GBP",
    prefix: "£1,234.56",
    suffix: "1,234.56 GBP",
    fullWidth: "￡１，２３４．５６",
    ambiguous: "£1,234.56",
    fraction: "£0.05",
    fractionMinorUnits: 5
  },
  {
    currency: "CNY",
    prefix: "RMB 1,234.56",
    suffix: "1,234.56元",
    fullWidth: "ＲＭＢ １，２３４．５６",
    ambiguous: "¥1,234.56",
    fraction: "¥0.05",
    fractionMinorUnits: 5
  },
  {
    currency: "KRW",
    prefix: "₩1,234",
    suffix: "1,234원",
    fullWidth: "ＫＲＷ １，２３４",
    ambiguous: "₩1,234",
    fraction: "₩1,234.00",
    fractionMinorUnits: null
  },
  {
    currency: "TWD",
    prefix: "NT$1,234.56",
    suffix: "1,234.56 TWD",
    fullWidth: "ＮＴ＄１，２３４．５６",
    ambiguous: "$1,234.56",
    fraction: "NT$0.05",
    fractionMinorUnits: 5
  },
  {
    currency: "HKD",
    prefix: "HK$1,234.56",
    suffix: "1,234.56 HKD",
    fullWidth: "ＨＫ＄１，２３４．５６",
    ambiguous: "$1,234.56",
    fraction: "HK$0.05",
    fractionMinorUnits: 5
  },
  {
    currency: "AUD",
    prefix: "A$1,234.56",
    suffix: "1,234.56 AUD",
    fullWidth: "Ａ＄１，２３４．５６",
    ambiguous: "$1,234.56",
    fraction: "A$0.05",
    fractionMinorUnits: 5
  },
  {
    currency: "CAD",
    prefix: "C$1,234.56",
    suffix: "1,234.56 CAD",
    fullWidth: "Ｃ＄１，２３４．５６",
    ambiguous: "$1,234.56",
    fraction: "C$0.05",
    fractionMinorUnits: 5
  },
  {
    currency: "SGD",
    prefix: "S$1,234.56",
    suffix: "1,234.56 SGD",
    fullWidth: "Ｓ＄１，２３４．５６",
    ambiguous: "$1,234.56",
    fraction: "S$0.05",
    fractionMinorUnits: 5
  },
  {
    currency: "CHF",
    prefix: "CHF 1’234.56",
    suffix: "1’234.56 CHF",
    fullWidth: "ＣＨＦ １’２３４．５６",
    ambiguous: "Fr.1’234.56",
    fraction: "CHF 0.05",
    fractionMinorUnits: 5
  }
] as const satisfies ReadonlyArray<{
  currency: SourceCurrencyCode;
  prefix: string;
  suffix: string;
  fullWidth: string;
  ambiguous: string;
  fraction: string;
  fractionMinorUnits: number | null;
}>;

describe("Price Localization", () => {
  it.each(LOCALIZATION_MATRIX)(
    "covers prefix, suffix, full-width, grouping, fraction digits, and negative evidence for $currency",
    ({
      currency,
      prefix,
      suffix,
      fullWidth,
      ambiguous,
      fraction,
      fractionMinorUnits
    }) => {
      for (const evidence of [prefix, suffix, fullWidth, ambiguous]) {
        expect(localizePrices(currency, [token(evidence)])[0]?.minorUnits).toBe(
          currency === "JPY" || currency === "KRW" ? 1234 : 123456
        );
      }
      expect(
        localizePrices(currency, [token(fraction)])[0]?.minorUnits ?? null
      ).toBe(fractionMinorUnits);
      for (const negativeEvidence of [
        "20% off",
        "item no.",
        "20 points"
      ]) {
        expect(
          localizePrices(currency, [
            token(negativeEvidence),
            token(prefix)
          ])
        ).toEqual([]);
      }
    }
  );

  it.each([
    ["USD", "$1,234.56", 123456],
    ["EUR", "1.234,56 €", 123456],
    ["JPY", "￥１，２３４", 1234],
    ["GBP", "£1,234.56", 123456],
    ["CNY", "１，２３４．５６元", 123456],
    ["KRW", "1,234원", 1234],
    ["TWD", "NT$1,234.56", 123456],
    ["HKD", "HK$1,234.56", 123456],
    ["AUD", "A$1,234.56", 123456],
    ["CAD", "C$1,234.56", 123456],
    ["SGD", "S$1,234.56", 123456],
    ["CHF", "CHF 1’234.56", 123456]
  ] satisfies ReadonlyArray<
    readonly [SourceCurrencyCode, string, number]
  >)(
    "parses conventional %s notation into exact minor units",
    (currency, text, minorUnits) => {
      expect(localizePrices(currency, [token(text)])).toEqual([
        {
          currency,
          minorUnits,
          confidence: 93,
          box: BOX
        }
      ]);
    }
  );

  it.each([
    ["USD", "$42.50"],
    ["EUR", "42,50€"],
    ["JPY", "42円"],
    ["GBP", "42.50 GBP"],
    ["CNY", "RMB 42.50"],
    ["KRW", "KRW 42"],
    ["TWD", "42.50 TWD"],
    ["HKD", "42.50 HKD"],
    ["AUD", "42.50 AUD"],
    ["CAD", "42.50 CAD"],
    ["SGD", "42.50 SGD"],
    ["CHF", "42.50 CHF"]
  ] satisfies ReadonlyArray<readonly [SourceCurrencyCode, string]>)(
    "supports suffix or alternate-marker evidence for %s",
    (currency, text) => {
      expect(localizePrices(currency, [token(text)]).map((price) => price.minorUnits))
        .toEqual([currency === "JPY" || currency === "KRW" ? 42 : 4250]);
    }
  );

  it.each([
    ["USD", "$19.99", "USD"],
    ["AUD", "$19.99", "AUD"],
    ["CAD", "$19.99", "CAD"],
    ["SGD", "$19.99", "SGD"],
    ["HKD", "$19.99", "HKD"],
    ["JPY", "¥1,999", "JPY"],
    ["CNY", "¥1,999.00", "CNY"]
  ] satisfies ReadonlyArray<
    readonly [SourceCurrencyCode, string, SourceCurrencyCode]
  >)(
    "resolves ambiguous %s symbol evidence only through the selected profile",
    (selected, text, expected) => {
      expect(localizePrices(selected, [token(text)])[0]?.currency).toBe(expected);
    }
  );

  it("combines exact adjacent marker and amount boxes without using a whole line", () => {
    expect(
      localizePrices("JPY", [
        {
          text: "4,142",
          confidence: 96,
          line: { blockIndex: 0, paragraphIndex: 0, lineIndex: 2 },
          box: { x: 20, y: 20, width: 72, height: 24 }
        },
        {
          text: "円",
          confidence: 91,
          line: { blockIndex: 0, paragraphIndex: 0, lineIndex: 2 },
          box: { x: 94, y: 20, width: 18, height: 24 }
        }
      ])
    ).toEqual([
      {
        currency: "JPY",
        minorUnits: 4142,
        confidence: 91,
        box: { x: 20, y: 20, width: 92, height: 24 }
      }
    ]);
  });

  it("returns every confident localized candidate with its own evidence and box", () => {
    expect(
      localizePrices("USD", [
        token("$12.50", 95),
        {
          text: "$24.00",
          confidence: 88,
          box: { x: 220, y: 110, width: 96, height: 28 }
        },
        {
          text: "$99.99",
          confidence: 57,
          box: { x: 80, y: 280, width: 92, height: 28 }
        }
      ]).filter(({ confidence }) => confidence >= 60)
    ).toEqual([
      {
        currency: "USD",
        minorUnits: 1250,
        confidence: 95,
        box: BOX
      },
      {
        currency: "USD",
        minorUnits: 2400,
        confidence: 88,
        box: { x: 220, y: 110, width: 96, height: 28 }
      }
    ]);
  });

  it.each([
    ["percentage", [token("$20.00"), token("20% off")]],
    ["product number", [token("item no."), token("$20.00")]],
    ["points", [token("20ポイント"), token("¥20")]],
    ["malformed grouping", [token("$12,34.56")]],
    ["wrong fraction digits", [token("$12.5")]],
    ["unmarked number", [token("1,234.56")]]
  ])("rejects negative evidence: %s", (_label, tokens) => {
    expect(localizePrices("USD", tokens)).toEqual([]);
  });
});
