import { describe, expect, it } from "vitest";

import {
  COMPARISON_PROFILE_LIMITS,
  JPY_COMPARISON_PROFILES,
  isComparisonProfileEligible,
  verifyComparisonProfileMetadata
} from "./comparisonProfiles";

describe("JPY comparison profiles", () => {
  it("freezes one versioned profile for each approved engine configuration", () => {
    expect(
      JPY_COMPARISON_PROFILES.map((profile) => ({
        id: profile.id,
        engine: profile.recognition.recognizer.engine,
        model: profile.reproduction.modelIdentity
      }))
    ).toEqual([
      {
        id: "jpy-pp-ocrv6-small.2026-08-03",
        engine: "paddleocr.js",
        model: "PP-OCRv6_small_det+PP-OCRv6_small_rec"
      },
      {
        id: "jpy-pp-ocrv5-mobile.2026-08-03",
        engine: "paddleocr.js",
        model: "PP-OCRv5_mobile_det+PP-OCRv5_mobile_rec"
      },
      {
        id: "jpy-tesseract-7.2026-08-03",
        engine: "tesseract.js",
        model: "tessdata_fast-4.1.0:jpn+eng"
      }
    ]);

    for (const profile of JPY_COMPARISON_PROFILES) {
      expect(profile.version).toBe("comparison-profile.v1");
      expect(profile.recognition.sourceCurrency).toBe("JPY");
      expect(profile.recognition.qualificationState).toBe("pending");
      expect(Object.isFrozen(profile)).toBe(true);
      expect(() => verifyComparisonProfileMetadata(profile)).not.toThrow();
    }
  });

  it("counts every pinned self-hosted asset in transfer and storage budgets", () => {
    for (const profile of JPY_COMPARISON_PROFILES) {
      const assets = profile.assets;
      expect(assets.flatMap(({ roles }) => roles)).toEqual(
        expect.arrayContaining([
          "runtime",
          "worker",
          "model",
          "dictionary",
          "preprocessing",
          "configuration"
        ])
      );
      expect(
        assets.every(
          ({ path, hash, transferBytes, storageBytes, roles }) =>
            /^\/(?!\/)/u.test(path) &&
            /^sha256:[a-f\d]{64}$/u.test(hash) &&
            transferBytes > 0 &&
            storageBytes > 0 &&
            roles.length > 0
        )
      ).toBe(true);
      expect(profile.budget).toEqual({
        transferBytes: assets.reduce(
          (total, asset) => total + asset.transferBytes,
          0
        ),
        storageBytes: assets.reduce(
          (total, asset) => total + asset.storageBytes,
          0
        )
      });
      expect(profile.budget.transferBytes).toBeLessThanOrEqual(
        COMPARISON_PROFILE_LIMITS.maximumTransferBytes
      );
      expect(profile.budget.storageBytes).toBeLessThanOrEqual(
        COMPARISON_PROFILE_LIMITS.maximumStorageBytes
      );
      expect(isComparisonProfileEligible(profile)).toBe(true);
    }
  });

  it("makes profiles over either hard budget ineligible", () => {
    const profile = JPY_COMPARISON_PROFILES[0];
    const excessTransfer =
      COMPARISON_PROFILE_LIMITS.maximumTransferBytes +
      1 -
      profile.budget.transferBytes;
    const assets = [
      ...profile.assets,
      {
        path: "/ocr/comparison/over-budget.bin" as const,
        hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
        roles: ["runtime" as const],
        transferBytes: excessTransfer,
        storageBytes: excessTransfer
      }
    ];
    const overBudget = {
      ...profile,
      assets,
      budget: {
        transferBytes: profile.budget.transferBytes + excessTransfer,
        storageBytes: profile.budget.storageBytes + excessTransfer
      }
    };

    expect(isComparisonProfileEligible(overBudget)).toBe(false);
    expect(() => verifyComparisonProfileMetadata(overBudget)).toThrow(
      /budget/i
    );
  });

  it("accounts only the selected WASM path and the imported SDK bootstrap", () => {
    for (const profile of JPY_COMPARISON_PROFILES.slice(0, 2)) {
      expect(profile.assets.map(({ path }) => path)).toEqual(
        expect.arrayContaining([
          "/ocr/paddleocr-js-0.4.2/index.mjs",
          "/ocr/onnxruntime-web-1.24.3/ort-wasm-simd-threaded.mjs",
          "/ocr/onnxruntime-web-1.24.3/ort-wasm-simd-threaded.wasm"
        ])
      );
      expect(
        profile.assets.some(({ path }) =>
          /\.(?:asyncify|jsep|jspi)\./u.test(path)
        )
      ).toBe(false);
    }
  });

  it("keeps iOS on the official SDK WASM path with the escape hatch inactive", () => {
    for (const profile of JPY_COMPARISON_PROFILES) {
      expect(profile.execution).toMatchObject({
        platform: "ios",
        backend: "wasm",
        worker: true,
        directOrtEscapeHatch: {
          active: false,
          blocker: null
        }
      });
      if (profile.recognition.recognizer.engine === "paddleocr.js") {
        expect(profile.execution.sdk).toBe("official-paddleocr.js");
      }
    }
  });

  it("records the frozen inputs needed to reproduce a physical trial", () => {
    for (const profile of JPY_COMPARISON_PROFILES) {
      expect(profile.reproduction).toEqual(
        expect.objectContaining({
          frozenAt: "2026-08-03T00:00:00.000Z",
          profileVersion: "comparison-profile.v1",
          sourceCurrency: "JPY",
          physicalPlatform: "ios",
          sdkPackage: expect.any(String),
          sdkVersion: expect.any(String),
          sdkIntegrity: expect.stringMatching(/^sha512-/u),
          runtimePackage: expect.any(String),
          runtimeVersion: expect.any(String),
          modelIdentity: expect.any(String),
          evidenceContractVersion: expect.any(String)
        })
      );
    }
  });
});
