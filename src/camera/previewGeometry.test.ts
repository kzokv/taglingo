import { describe, expect, it } from "vitest";

import {
  calculateCoverGeometry,
  mapSampleBoxToPreview
} from "./previewGeometry";

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

  it("maps an OCR token box from a central camera crop into a cover preview", () => {
    const box = mapSampleBoxToPreview(
      { x: 80, y: 40, width: 160, height: 80 },
      { x: 800, y: 460, width: 320, height: 160 },
      { width: 1920, height: 1080 },
      { width: 390, height: 844 }
    );

    expect(box.x).toBeCloseTo(132.481, 3);
    expect(box.y).toBeCloseTo(390.741, 3);
    expect(box.width).toBeCloseTo(125.037, 3);
    expect(box.height).toBeCloseTo(62.519, 3);
  });
});
