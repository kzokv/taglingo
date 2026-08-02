import { describe, expect, it } from "vitest";

import { SOURCE_CURRENCIES } from "./currencies";
import { parseAmountOnlyEntry } from "./manualPriceEntry";

describe("Manual Price Entry", () => {
  it.each([
    ["USD", "12.34", 1234, "12.34"],
    ["JPY", "58980", 58980, "58,980"]
  ] as const)(
    "turns an amount-only %s entry into exact minor units",
    (currency, input, expectedMinorUnits, expectedDisplay) => {
      expect(parseAmountOnlyEntry(currency, input)).toEqual({
        ok: true,
        enteredPrice: {
          provenance: "entered",
          currency,
          minorUnits: expectedMinorUnits,
          displayAmount: expectedDisplay
        }
      });
    }
  );

  it("accepts a plain whole amount for every Source Currency", () => {
    for (const { code } of SOURCE_CURRENCIES) {
      const result = parseAmountOnlyEntry(code, "12");
      expect(result.ok, code).toBe(true);
      if (result.ok) {
        expect(result.enteredPrice.currency).toBe(code);
        expect(result.enteredPrice.provenance).toBe("entered");
        expect(Number.isSafeInteger(result.enteredPrice.minorUnits)).toBe(true);
      }
    }
  });

  it.each(["", "12,34", "USD 12", "-12", "1e3", "12.345"])(
    "rejects non-plain or unsafe USD amount %s",
    (input) => {
      expect(parseAmountOnlyEntry("USD", input)).toMatchObject({ ok: false });
    }
  );

  it("rejects values beyond safe exact minor units", () => {
    expect(
      parseAmountOnlyEntry("USD", "9007199254740991")
    ).toMatchObject({ ok: false });
  });
});
