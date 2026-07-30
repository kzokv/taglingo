import { describe, expect, it } from "vitest";

import { calculateCoverGeometry } from "./previewGeometry";

describe("camera preview geometry", () => {
  it("centers a landscape camera inside a portrait cover preview", () => {
    expect(
      calculateCoverGeometry(
        { width: 1920, height: 1080 },
        { width: 390, height: 844 }
      )
    ).toEqual({
      scale: 0.7814814814814814,
      renderedWidth: 1500.4444444444443,
      renderedHeight: 844,
      offsetX: -555.2222222222222,
      offsetY: 0
    });
  });

  it("centers a portrait camera inside a landscape cover preview", () => {
    expect(
      calculateCoverGeometry(
        { width: 1080, height: 1920 },
        { width: 844, height: 390 }
      )
    ).toEqual({
      scale: 0.7814814814814814,
      renderedWidth: 844,
      renderedHeight: 1500.4444444444443,
      offsetX: 0,
      offsetY: -555.2222222222222
    });
  });
});
