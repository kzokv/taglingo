import type { SourceCurrencyCode } from "./currencies";

export type PhysicalPlatform = "ios" | "android" | "other";

export const CAMERA_QUALIFICATION_CANDIDATE_CURRENCIES = [
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
] as const satisfies readonly SourceCurrencyCode[];

export interface CurrencyCapability {
  sourceCurrency: SourceCurrencyCode;
  platform: PhysicalPlatform;
  manualPriceEntry: true;
  cameraQualificationCandidate: boolean;
  cameraSupported: boolean;
}

const CAMERA_QUALIFICATION_CANDIDATE_SET = new Set<SourceCurrencyCode>(
  CAMERA_QUALIFICATION_CANDIDATE_CURRENCIES
);

// Camera support is earned independently per physical platform. No profile has
// passed that gate yet, so every currency currently remains Manual Entry only.
const CAMERA_SUPPORTED_CURRENCIES: Record<
  PhysicalPlatform,
  ReadonlySet<SourceCurrencyCode>
> = {
  ios: new Set(),
  android: new Set(),
  other: new Set()
};

export function detectPhysicalPlatform(userAgent: string): PhysicalPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return "ios";
  }
  if (/Android/i.test(userAgent)) {
    return "android";
  }
  return "other";
}

export function getCurrencyCapability(
  sourceCurrency: SourceCurrencyCode,
  platform: PhysicalPlatform
): CurrencyCapability {
  return {
    sourceCurrency,
    platform,
    manualPriceEntry: true,
    cameraQualificationCandidate:
      CAMERA_QUALIFICATION_CANDIDATE_SET.has(sourceCurrency),
    cameraSupported: CAMERA_SUPPORTED_CURRENCIES[platform].has(sourceCurrency)
  };
}
