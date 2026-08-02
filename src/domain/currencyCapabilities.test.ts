import { describe, expect, it } from "vitest";

import { SOURCE_CURRENCIES } from "./currencies";
import {
  CAMERA_QUALIFICATION_CANDIDATE_CURRENCIES,
  detectPhysicalPlatform,
  getCurrencyCapability
} from "./currencyCapabilities";

describe("Currency Capability Catalog", () => {
  it("makes Manual Price Entry universal across the provider catalog", () => {
    for (const { code } of SOURCE_CURRENCIES) {
      expect(getCurrencyCapability(code, "ios").manualPriceEntry).toBe(true);
      expect(getCurrencyCapability(code, "android").manualPriceEntry).toBe(
        true
      );
    }
  });

  it("identifies exactly the fourteen initial camera candidates", () => {
    expect(CAMERA_QUALIFICATION_CANDIDATE_CURRENCIES).toEqual([
      "USD",
      "EUR",
      "JPY",
      "GBP",
      "CNY",
      "KRW",
      "TWD",
      "HKD",
      "AUD",
      "CAD",
      "SGD",
      "CHF",
      "THB",
      "CZK"
    ]);
  });

  it("keeps camera support platform-specific and unqualified by default", () => {
    expect(getCurrencyCapability("JPY", "ios")).toMatchObject({
      cameraQualificationCandidate: true,
      cameraSupported: false,
      platform: "ios"
    });
    expect(getCurrencyCapability("JPY", "android")).toMatchObject({
      cameraQualificationCandidate: true,
      cameraSupported: false,
      platform: "android"
    });
    expect(getCurrencyCapability("BRL", "ios")).toMatchObject({
      cameraQualificationCandidate: false,
      cameraSupported: false
    });
  });

  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "ios"],
    ["Mozilla/5.0 (Linux; Android 16; Pixel 10)", "android"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)", "other"]
  ] as const)("resolves %s to the %s platform family", (userAgent, platform) => {
    expect(detectPhysicalPlatform(userAgent)).toBe(platform);
  });
});
