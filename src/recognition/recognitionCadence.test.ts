import { describe, expect, it } from "vitest";

import { nextRecognitionDelay } from "./recognitionCadence";

describe("recognition cadence", () => {
  it("adapts the next frame delay to measured OCR duration within safe bounds", () => {
    expect(nextRecognitionDelay(100)).toBe(250);
    expect(nextRecognitionDelay(800)).toBe(400);
    expect(nextRecognitionDelay(3_000)).toBe(1_000);
  });
});
