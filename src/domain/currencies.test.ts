import { describe, expect, it } from "vitest";

import {
  SOURCE_CURRENCIES,
  searchTargetCurrencies
} from "./currencies";

describe("Currency Catalog", () => {
  it("offers exactly the twelve optimized Source Currencies", () => {
    expect(SOURCE_CURRENCIES.map(({ code }) => code)).toEqual([
      "USD",
      "EUR",
      "JPY",
      "GBP",
      "CNY",
      "KRW",
      "TWD",
      "HKD",
      "AUD",
      "CAD",
      "SGD",
      "CHF"
    ]);
  });

  it.each([
    ["usd", "USD"],
    ["Japanese yen", "JPY"],
    ["台幣", "TWD"],
    ["won", "KRW"]
  ])("finds Target Currencies using %s", (query, expectedCode) => {
    expect(searchTargetCurrencies(query).map(({ code }) => code)).toContain(
      expectedCode
    );
  });
});
