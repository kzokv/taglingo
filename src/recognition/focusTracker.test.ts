import { describe, expect, it } from "vitest";

import { createFocusTracker } from "./focusTracker";
import type { DetectedPrice } from "./priceLocalization";

const nearCaptureGuide: DetectedPrice = {
  currency: "JPY",
  minorUnits: 4142,
  confidence: 94,
  box: { x: 170, y: 370, width: 80, height: 32 }
};

describe("Focused Price tracking", () => {
  it("commits the Capture Guide-nearest Detected Price after two compatible observations", () => {
    const tracker = createFocusTracker({
      captureGuideCenter: { x: 195, y: 422 }
    });
    const farFromCaptureGuide: DetectedPrice = {
      ...nearCaptureGuide,
      minorUnits: 980,
      box: { x: 20, y: 80, width: 70, height: 28 }
    };

    expect(tracker.observe([farFromCaptureGuide, nearCaptureGuide])).toBeNull();
    expect(
      tracker.observe([
        farFromCaptureGuide,
        {
          ...nearCaptureGuide,
          box: { x: 172, y: 369, width: 80, height: 32 }
        }
      ])
    ).toEqual({
      ...nearCaptureGuide,
      box: { x: 172, y: 369, width: 80, height: 32 }
    });
  });

  it("keeps the Focused Price through two brief misses and clears it on a sustained miss", () => {
    const tracker = createFocusTracker({
      captureGuideCenter: { x: 195, y: 422 }
    });
    const updatedBox = {
      ...nearCaptureGuide,
      box: { x: 174, y: 372, width: 80, height: 32 }
    };
    tracker.observe([nearCaptureGuide]);
    tracker.observe([nearCaptureGuide]);

    expect(tracker.observe([updatedBox])).toEqual(updatedBox);
    expect(tracker.observe([])).toEqual(updatedBox);
    expect(tracker.observe([])).toEqual(updatedBox);
    expect(tracker.observe([])).toBeNull();
  });

  it("replaces an exact value only after two consistent changed observations", () => {
    const tracker = createFocusTracker({
      captureGuideCenter: { x: 195, y: 422 }
    });
    const changedPrice = { ...nearCaptureGuide, minorUnits: 4199 };
    tracker.observe([nearCaptureGuide]);
    tracker.observe([nearCaptureGuide]);

    expect(tracker.observe([changedPrice])).toEqual(nearCaptureGuide);
    expect(tracker.observe([changedPrice])).toEqual(changedPrice);
  });

  it("selects against the current Capture Guide after the preview is resized", () => {
    const tracker = createFocusTracker({
      captureGuideCenter: { x: 195, y: 422 }
    });
    const otherPrice = {
      ...nearCaptureGuide,
      minorUnits: 980,
      box: { x: 20, y: 80, width: 70, height: 28 }
    };
    tracker.observe([nearCaptureGuide, otherPrice]);
    tracker.observe([nearCaptureGuide, otherPrice]);

    expect(
      tracker.observe([nearCaptureGuide, otherPrice], { x: 50, y: 94 })
    ).toEqual(nearCaptureGuide);
    expect(
      tracker.observe([nearCaptureGuide, otherPrice], { x: 50, y: 94 })
    ).toEqual(otherPrice);
  });

  it("keeps a near-tie stable across candidate-order jitter until there is a clear winner", () => {
    const tracker = createFocusTracker({
      captureGuideCenter: { x: 200, y: 400 }
    });
    const leftPrice = {
      ...nearCaptureGuide,
      minorUnits: 1000,
      box: { x: 150, y: 380, width: 40, height: 20 }
    };
    const tiedRightPrice = {
      ...nearCaptureGuide,
      minorUnits: 1010,
      box: { x: 210, y: 380, width: 40, height: 20 }
    };

    expect(tracker.observe([tiedRightPrice, leftPrice])).toBeNull();
    expect(tracker.observe([leftPrice, tiedRightPrice])).toEqual(leftPrice);
    expect(tracker.observe([tiedRightPrice, leftPrice])).toEqual(leftPrice);
    expect(tracker.observe([leftPrice, tiedRightPrice])).toEqual(leftPrice);

    const clearRightWinner = {
      ...tiedRightPrice,
      box: { x: 195, y: 381, width: 40, height: 20 }
    };
    expect(tracker.observe([leftPrice, clearRightWinner])).toEqual(leftPrice);
    expect(tracker.observe([clearRightWinner, leftPrice])).toEqual(
      clearRightWinner
    );
  });

  it("never treats a nearby amount within a percentage tolerance as the same value", () => {
    const tracker = createFocusTracker({
      captureGuideCenter: { x: 195, y: 422 }
    });
    const onePercentDifferent = { ...nearCaptureGuide, minorUnits: 4183 };
    tracker.observe([nearCaptureGuide]);
    tracker.observe([nearCaptureGuide]);

    expect(tracker.observe([onePercentDifferent])).toEqual(nearCaptureGuide);
    expect(tracker.observe([onePercentDifferent])).toEqual(onePercentDifferent);
  });
});
