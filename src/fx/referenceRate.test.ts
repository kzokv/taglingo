import { describe, expect, it } from "vitest";

import { formatCurrencyMinorUnits } from "../domain/currencies";
import { convertWithReferenceRate } from "./referenceRate";

describe("Reference Rate conversion", () => {
  it("preserves the largest exact Entered Price through conversion", () => {
    const convertedMinorUnits = convertWithReferenceRate(
      { currency: "USD", minorUnits: Number.MAX_SAFE_INTEGER },
      { source: "USD", target: "USD", value: "2" }
    );

    expect(convertedMinorUnits).toBe(18_014_398_509_481_982n);
    expect(formatCurrencyMinorUnits(convertedMinorUnits, "USD")).toBe(
      "180,143,985,094,819.82"
    );
  });

  it("rounds a decimal Reference Rate to exact target minor units", () => {
    expect(
      convertWithReferenceRate(
        { currency: "JPY", minorUnits: 4142 },
        { source: "JPY", target: "USD", value: "0.0067123" }
      )
    ).toBe(2780n);
  });

  it("rejects a Reference Rate for a different Source Currency", () => {
    expect(() =>
      convertWithReferenceRate(
        { currency: "JPY", minorUnits: 4142 },
        { source: "EUR", target: "USD", value: "1.2" }
      )
    ).toThrow(/source must match/i);
  });
});
