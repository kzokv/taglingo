import { expect, it, vi } from "vitest";

import { createTestRecognitionProfile } from "../test/recognitionProfile";
import type { OcrRecognizer, RecognizerObservation } from "./ocrRecognizer";
import { recognizePriceEvidence } from "./recognitionPipeline";

function recognized(
  text: string,
  preprocessingIdentity: string,
  box: { x: number; y: number; width: number; height: number },
  evidenceKind: RecognizerObservation["evidenceKind"] = "text"
): RecognizerObservation {
  return {
    text,
    evidenceKind,
    confidence: 92,
    line: { blockIndex: 0, paragraphIndex: 0, lineIndex: 0 },
    box,
    polygon: [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
      { x: box.x, y: box.y + box.height }
    ],
    timing: { startedAtMs: 1, completedAtMs: 2, durationMs: 1 },
    passIdentity: {
      kind: "guide",
      frameIdentity: "frame-7",
      preprocessingIdentity
    }
  };
}

it("runs one frame portfolio sequentially and fuses normalized variant geometry", async () => {
  const images = [
    document.createElement("canvas"),
    document.createElement("canvas"),
    document.createElement("canvas")
  ];
  let activeRecognitions = 0;
  let maximumActiveRecognitions = 0;
  const recognize = vi.fn(async (_image, identity) => {
    activeRecognitions += 1;
    maximumActiveRecognitions = Math.max(
      maximumActiveRecognitions,
      activeRecognitions
    );
    await Promise.resolve();
    activeRecognitions -= 1;
    const scale = identity.preprocessingIdentity === "raw" ? 1 : 2;
    return [
      recognized(
        "4,142",
        identity.preprocessingIdentity,
        { x: 20 * scale, y: 20 * scale, width: 55 * scale, height: 20 * scale }
      ),
      recognized(
        "円",
        identity.preprocessingIdentity,
        { x: 80 * scale, y: 20 * scale, width: 20 * scale, height: 20 * scale },
        "marker"
      )
    ];
  });
  const recognizer: OcrRecognizer = {
    prepare: vi.fn(),
    recognize,
    terminate: vi.fn()
  };

  const candidates = await recognizePriceEvidence(
    createTestRecognitionProfile(),
    recognizer,
    images[0],
    { kind: "guide", frameIdentity: "frame-7" },
    {
      preprocess: () => [
        { identity: "raw", image: images[0], coordinateScale: 1 },
        { identity: "contrast", image: images[1], coordinateScale: 2 },
        { identity: "threshold", image: images[2], coordinateScale: 2 }
      ]
    }
  );

  expect(maximumActiveRecognitions).toBe(1);
  expect(candidates).toEqual([
    expect.objectContaining({
      currency: "JPY",
      minorUnits: 4142,
      box: { x: 20, y: 20, width: 80, height: 20 },
      frameIdentity: "frame-7",
      preprocessingIdentities: ["contrast", "raw", "threshold"]
    })
  ]);
});
