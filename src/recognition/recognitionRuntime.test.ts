import { describe, expect, it } from "vitest";

import { SOURCE_CURRENCIES } from "../domain/currencies";
import {
  assertValidRecognitionRuntime,
  recognitionRuntimeAssets,
  UNIVERSAL_RECOGNITION_RUNTIME
} from "./recognitionRuntime";

describe("universal Recognition Runtime", () => {
  it("pins one self-hosted multilingual runtime without currency or platform state", () => {
    expect(UNIVERSAL_RECOGNITION_RUNTIME.recognizer.languages).toEqual([
      "eng",
      "jpn",
      "chi_sim",
      "chi_tra",
      "kor"
    ]);
    expect(recognitionRuntimeAssets(UNIVERSAL_RECOGNITION_RUNTIME)).toHaveLength(
      13
    );
    for (const asset of recognitionRuntimeAssets(
      UNIVERSAL_RECOGNITION_RUNTIME
    )) {
      expect(asset.path).toMatch(/^\/ocr\//u);
      expect(asset.hash).toMatch(/^sha256:[a-f\d]{64}$/u);
    }
    for (const model of UNIVERSAL_RECOGNITION_RUNTIME.recognizer.assets.models) {
      expect(model.decodedHash).toMatch(/^sha256:[a-f\d]{64}$/u);
    }
    const serialized = JSON.stringify(UNIVERSAL_RECOGNITION_RUNTIME);
    expect(serialized).not.toContain("sourceCurrency");
    expect(serialized).not.toContain("platform");
    expect(serialized).not.toContain("qualification");
    expect(SOURCE_CURRENCIES).toHaveLength(31);
  });

  it("freezes engine and recognition rules independently of shopper settings", () => {
    expect(Object.isFrozen(UNIVERSAL_RECOGNITION_RUNTIME)).toBe(true);
    expect(Object.isFrozen(UNIVERSAL_RECOGNITION_RUNTIME.rules)).toBe(true);
    expect(
      Object.isFrozen(UNIVERSAL_RECOGNITION_RUNTIME.rules.thresholds)
    ).toBe(true);
    expect(UNIVERSAL_RECOGNITION_RUNTIME.rules).toMatchObject({
      thresholds: {
        textConfidence: 60,
        markerConfidence: 70,
        candidateConfidence: 70
      },
      stabilization: {
        requiredDistinctFrames: 2,
        coveredMissesBeforeRemoval: 3
      }
    });
  });

  it("rejects external or mismatched runtime assets", () => {
    expect(() =>
      assertValidRecognitionRuntime({
        ...UNIVERSAL_RECOGNITION_RUNTIME,
        recognizer: {
          ...UNIVERSAL_RECOGNITION_RUNTIME.recognizer,
          assets: {
            ...UNIVERSAL_RECOGNITION_RUNTIME.recognizer.assets,
            worker: {
              ...UNIVERSAL_RECOGNITION_RUNTIME.recognizer.assets.worker,
              path: "https://cdn.example.com/worker.js" as `/${string}`
            }
          }
        }
      })
    ).toThrow(/invalid/u);
  });
});
