import { describe, expect, it, vi } from "vitest";

import {
  SOURCE_CURRENCIES,
  searchTargetCurrencies
} from "./currencies";

describe("Currency Catalog", () => {
  it("offers every provider-backed currency for Manual Price Entry", () => {
    expect(SOURCE_CURRENCIES.map(({ code }) => code)).toEqual([
      "AUD",
      "BRL",
      "CAD",
      "CHF",
      "CNY",
      "CZK",
      "DKK",
      "EUR",
      "GBP",
      "HKD",
      "HUF",
      "IDR",
      "ILS",
      "INR",
      "ISK",
      "JPY",
      "KRW",
      "MXN",
      "MYR",
      "NOK",
      "NZD",
      "PHP",
      "PLN",
      "RON",
      "SEK",
      "SGD",
      "THB",
      "TRY",
      "TWD",
      "USD",
      "ZAR"
    ]);
    expect(SOURCE_CURRENCIES).toHaveLength(31);
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

  it("finds ISO codes regardless of the runtime's default casing locale", () => {
    const toLocaleLowerCase = String.prototype.toLocaleLowerCase;
    const localeSpy = vi.spyOn(
      String.prototype,
      "toLocaleLowerCase"
    ).mockImplementation(
      function (this: string, locales) {
        return toLocaleLowerCase.call(this, locales ?? "tr");
      }
    );

    expect(searchTargetCurrencies("inr").map(({ code }) => code)).toContain(
      "INR"
    );
    localeSpy.mockRestore();
  });
});
