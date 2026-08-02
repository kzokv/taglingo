import { describe, expect, it } from "vitest";

import { createTestRecognitionProfile } from "../test/recognitionProfile";
import { createRecognitionProfileRegistry } from "./recognitionProfile";

describe("Recognition Profile Registry", () => {
  it("resolves one qualified profile independently per Source Currency and platform", () => {
    const jpyIos = createTestRecognitionProfile({ id: "jpy-ios" });
    const jpyAndroid = createTestRecognitionProfile({
      id: "jpy-android",
      platform: "android"
    });
    const usdIos = createTestRecognitionProfile({
      id: "usd-ios",
      sourceCurrency: "USD"
    });
    const registry = createRecognitionProfileRegistry(
      [jpyIos, jpyAndroid, usdIos],
      { now: () => new Date("2026-08-02T00:00:00.000Z") }
    );

    expect(registry.resolve("JPY", "ios")).toBe(jpyIos);
    expect(registry.resolve("JPY", "android")).toBe(jpyAndroid);
    expect(registry.resolve("USD", "ios")).toBe(usdIos);
    expect(registry.resolve("USD", "android")).toBeNull();
  });

  it.each(["pending", "failed", "demoted"] as const)(
    "returns no camera capability for a %s profile",
    (qualificationState) => {
      const registry = createRecognitionProfileRegistry(
        [
          createTestRecognitionProfile({
            id: qualificationState,
            qualificationState
          })
        ],
        { now: () => new Date("2026-08-02T00:00:00.000Z") }
      );

      expect(registry.resolve("JPY", "ios")).toBeNull();
    }
  );

  it("returns no camera capability once evidence expires", () => {
    const registry = createRecognitionProfileRegistry(
      [
        createTestRecognitionProfile({
          id: "expired",
          expiresAt: "2026-08-01T23:59:59.999Z"
        })
      ],
      { now: () => new Date("2026-08-02T00:00:00.000Z") }
    );

    expect(registry.resolve("JPY", "ios")).toBeNull();
  });

  it("deep-freezes the profile contract and rejects ambiguous entries", () => {
    const frozen = createTestRecognitionProfile({ id: "frozen" });
    const registry = createRecognitionProfileRegistry([frozen]);

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.recognizer.assets.models)).toBe(true);
    expect(Object.isFrozen(frozen.preprocessing[0])).toBe(true);
    expect(() =>
      createRecognitionProfileRegistry([
        createTestRecognitionProfile({ id: "first" }),
        createTestRecognitionProfile({ id: "second" })
      ])
    ).toThrow(/one recognition profile/i);
    expect(registry.resolve("JPY", "other")).toBeNull();
  });

  it("rejects recognition assets that are not same-origin pinned files", () => {
    const unsafe = createTestRecognitionProfile({ id: "unsafe" });
    const profileWithRemoteWorker = {
      ...unsafe,
      recognizer: {
        ...unsafe.recognizer,
        assets: {
          ...unsafe.recognizer.assets,
          worker: {
            ...unsafe.recognizer.assets.worker,
            path: "//cdn.example.com/worker.js" as const
          }
        }
      }
    };

    expect(() =>
      createRecognitionProfileRegistry([profileWithRemoteWorker])
    ).toThrow(/self-hosted/i);
  });

  it("rejects model declarations that do not match the loaded languages", () => {
    const mismatched = createTestRecognitionProfile({
      id: "mismatched-model"
    });
    const profileWithMismatchedModel = {
      ...mismatched,
      recognizer: {
        ...mismatched.recognizer,
        assets: {
          ...mismatched.recognizer.assets,
          models: mismatched.recognizer.assets.models.map((model, index) =>
            index === 0
              ? {
                  ...model,
                  path: "/ocr/tessdata_fast-4.1.0/eng.traineddata.gz" as const
                }
              : model
          )
        }
      }
    };

    expect(() =>
      createRecognitionProfileRegistry([profileWithMismatchedModel])
    ).toThrow(/model assets/i);
  });
});
