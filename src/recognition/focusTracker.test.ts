import { describe, expect, it } from "vitest";

import { createFocusTracker } from "./focusTracker";
import type { DetectedPrice } from "./jpyPriceLocalization";

const nearReticle: DetectedPrice = {
  currency: "JPY",
  minorUnits: 4142,
  confidence: 94,
  box: { x: 170, y: 370, width: 80, height: 32 }
};

describe("Focused Price tracking", () => {
  it("commits the reticle-nearest Detected Price after two compatible observations", () => {
    const tracker = createFocusTracker({ reticle: { x: 195, y: 422 } });
    const farFromReticle: DetectedPrice = {
      ...nearReticle,
      minorUnits: 980,
      box: { x: 20, y: 80, width: 70, height: 28 }
    };

    expect(tracker.observe([farFromReticle, nearReticle])).toBeNull();
    expect(
      tracker.observe([
        farFromReticle,
        {
          ...nearReticle,
          box: { x: 172, y: 369, width: 80, height: 32 }
        }
      ])
    ).toEqual({
      ...nearReticle,
      box: { x: 172, y: 369, width: 80, height: 32 }
    });
  });

  it("keeps the Focused Price through two brief misses and clears it on a sustained miss", () => {
    const tracker = createFocusTracker({ reticle: { x: 195, y: 422 } });
    const updatedBox = {
      ...nearReticle,
      box: { x: 174, y: 372, width: 80, height: 32 }
    };
    tracker.observe([nearReticle]);
    tracker.observe([nearReticle]);

    expect(tracker.observe([updatedBox])).toEqual(updatedBox);
    expect(tracker.observe([])).toEqual(updatedBox);
    expect(tracker.observe([])).toEqual(updatedBox);
    expect(tracker.observe([])).toBeNull();
  });

  it("replaces an exact value only after two consistent changed observations", () => {
    const tracker = createFocusTracker({ reticle: { x: 195, y: 422 } });
    const changedPrice = { ...nearReticle, minorUnits: 4199 };
    tracker.observe([nearReticle]);
    tracker.observe([nearReticle]);

    expect(tracker.observe([changedPrice])).toEqual(nearReticle);
    expect(tracker.observe([changedPrice])).toEqual(changedPrice);
  });

  it("selects against the current reticle after the preview is resized", () => {
    const tracker = createFocusTracker({ reticle: { x: 195, y: 422 } });
    const otherPrice = {
      ...nearReticle,
      minorUnits: 980,
      box: { x: 20, y: 80, width: 70, height: 28 }
    };
    tracker.observe([nearReticle, otherPrice]);
    tracker.observe([nearReticle, otherPrice]);

    expect(
      tracker.observe([nearReticle, otherPrice], { x: 50, y: 94 })
    ).toEqual(nearReticle);
    expect(
      tracker.observe([nearReticle, otherPrice], { x: 50, y: 94 })
    ).toEqual(otherPrice);
  });
});
