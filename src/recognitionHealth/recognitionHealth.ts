import type { SourceCurrencyCode } from "../domain/currencies";
import { hasExactKeys } from "../domain/exactObject";

export const APP_RELEASE = "0.1.0" as const;
export const RECOGNITION_HEALTH_SCHEMA_VERSION = 1 as const;

export const RECOGNITION_HEALTH_PLATFORMS = [
  "ios-safari",
  "android-chrome",
  "other"
] as const;
export const RECOGNITION_HEALTH_TIME_BUCKETS = [
  "not-reached",
  "under-1s",
  "1-to-5s",
  "5-to-15s",
  "15-to-30s",
  "over-30s"
] as const;
export const RECOGNITION_HEALTH_COUNT_BUCKETS = [
  "0",
  "1",
  "2-to-5",
  "6-to-20",
  "over-20"
] as const;
export const RECOGNITION_HEALTH_TERMINAL_OUTCOMES = [
  "focused-price-obtained",
  "entered-price-before-promotion",
  "entered-price-after-promotion",
  "closed-without-price",
  "camera-permission-denied",
  "camera-unavailable-or-interrupted",
  "recognition-initialization-failed",
  "recognition-ended-without-stable-price",
  "unexpected-recognition-failure"
] as const;
export const RECOGNITION_HEALTH_ERROR_FAMILIES = [
  "none",
  "camera-permission",
  "camera-unavailable",
  "camera-interrupted",
  "recognition-initialization",
  "recognition-runtime",
  "unexpected"
] as const;

export type RecognitionHealthPlatform =
  (typeof RECOGNITION_HEALTH_PLATFORMS)[number];
export type RecognitionHealthTimeBucket =
  (typeof RECOGNITION_HEALTH_TIME_BUCKETS)[number];
export type RecognitionHealthCountBucket =
  (typeof RECOGNITION_HEALTH_COUNT_BUCKETS)[number];
export type RecognitionHealthTerminalOutcome =
  (typeof RECOGNITION_HEALTH_TERMINAL_OUTCOMES)[number];
export type RecognitionHealthErrorFamily =
  (typeof RECOGNITION_HEALTH_ERROR_FAMILIES)[number];

export interface RecognitionHealthSummary {
  schemaVersion: typeof RECOGNITION_HEALTH_SCHEMA_VERSION;
  release: typeof APP_RELEASE;
  platform: RecognitionHealthPlatform;
  sourceCurrency: SourceCurrencyCode;
  timeToReady: RecognitionHealthTimeBucket;
  timeToFirstDetectedPrice: RecognitionHealthTimeBucket;
  timeToFirstFocusedPrice: RecognitionHealthTimeBucket;
  recognitionPassCount: RecognitionHealthCountBucket;
  missCount: RecognitionHealthCountBucket;
  focusChangeCount: RecognitionHealthCountBucket;
  stableDetectionCount: RecognitionHealthCountBucket;
  terminalOutcome: RecognitionHealthTerminalOutcome;
  errorFamily: RecognitionHealthErrorFamily;
}

export interface RecognitionHealthPreferences {
  sharingEnabled: boolean;
  invitationShown: boolean;
}

interface BrowserPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFERENCE_KEY = "taglingo.recognition-health.v1";
const DEFAULT_PREFERENCES: RecognitionHealthPreferences = {
  sharingEnabled: false,
  invitationShown: false
};

function isRecognitionHealthPreferences(
  value: unknown
): value is RecognitionHealthPreferences & { version: 1 } {
  return (
    hasExactKeys(value, ["version", "sharingEnabled", "invitationShown"]) &&
    value.version === 1 &&
    typeof value.sharingEnabled === "boolean" &&
    typeof value.invitationShown === "boolean"
  );
}

export function createRecognitionHealthPreferenceStore(
  storage?: BrowserPreferenceStorage
) {
  return {
    load(): RecognitionHealthPreferences {
      if (!storage) {
        return { ...DEFAULT_PREFERENCES };
      }
      try {
        const parsed: unknown = JSON.parse(
          storage.getItem(PREFERENCE_KEY) ?? "null"
        );
        return isRecognitionHealthPreferences(parsed)
          ? {
              sharingEnabled: parsed.sharingEnabled,
              invitationShown: parsed.invitationShown
            }
          : { ...DEFAULT_PREFERENCES };
      } catch {
        return { ...DEFAULT_PREFERENCES };
      }
    },

    save(preferences: RecognitionHealthPreferences): void {
      try {
        storage?.setItem(
          PREFERENCE_KEY,
          JSON.stringify({ version: 1, ...preferences })
        );
      } catch {
        // A blocked or full browser store leaves sharing disabled next load.
      }
    }
  };
}

export function detectRecognitionHealthPlatform(
  userAgent: string
): RecognitionHealthPlatform {
  const ios = /iPad|iPhone|iPod/.test(userAgent);
  const safari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
  if (ios && safari) {
    return "ios-safari";
  }
  if (/Android/.test(userAgent) && /Chrome\//.test(userAgent)) {
    return "android-chrome";
  }
  return "other";
}

function bucketTime(elapsedMs: number | null): RecognitionHealthTimeBucket {
  if (elapsedMs === null) return "not-reached";
  if (elapsedMs < 1_000) return "under-1s";
  if (elapsedMs < 5_000) return "1-to-5s";
  if (elapsedMs < 15_000) return "5-to-15s";
  if (elapsedMs < 30_000) return "15-to-30s";
  return "over-30s";
}

function bucketCount(count: number): RecognitionHealthCountBucket {
  if (count <= 0) return "0";
  if (count === 1) return "1";
  if (count <= 5) return "2-to-5";
  if (count <= 20) return "6-to-20";
  return "over-20";
}

export interface RecognitionHealthObservation {
  atMs: number;
  ready: boolean;
  detectedPriceCount: number;
  hasFocusedPrice: boolean;
  recognitionPassCount: number;
  missCount: number;
  focusChangeCount: number;
  stableDetectionCount: number;
}

export type SubmitRecognitionHealthSummary = (
  summary: RecognitionHealthSummary
) => Promise<void>;

export function createRecognitionHealthSession({
  consentAtStart,
  isSharingEnabled,
  platform,
  sourceCurrency,
  startedAtMs,
  submit
}: {
  consentAtStart: boolean;
  isSharingEnabled: () => boolean;
  platform: RecognitionHealthPlatform;
  sourceCurrency: SourceCurrencyCode;
  startedAtMs: number;
  submit: SubmitRecognitionHealthSummary;
}) {
  let finished = false;
  let readyAtMs: number | null = null;
  let detectedAtMs: number | null = null;
  let focusedAtMs: number | null = null;
  let recognitionPassCount = 0;
  let missCount = 0;
  let focusChangeCount = 0;
  let stableDetectionCount = 0;

  return {
    record(observation: RecognitionHealthObservation): void {
      if (finished) return;
      if (observation.ready && readyAtMs === null) readyAtMs = observation.atMs;
      if (observation.detectedPriceCount > 0 && detectedAtMs === null) {
        detectedAtMs = observation.atMs;
      }
      if (observation.hasFocusedPrice && focusedAtMs === null) {
        focusedAtMs = observation.atMs;
      }
      recognitionPassCount = Math.max(
        recognitionPassCount,
        observation.recognitionPassCount
      );
      missCount = Math.max(missCount, observation.missCount);
      focusChangeCount = Math.max(
        focusChangeCount,
        observation.focusChangeCount
      );
      stableDetectionCount = Math.max(
        stableDetectionCount,
        observation.stableDetectionCount
      );
    },

    async finish(
      terminalOutcome: RecognitionHealthTerminalOutcome,
      errorFamily: RecognitionHealthErrorFamily
    ): Promise<void> {
      if (finished) return;
      finished = true;
      if (!consentAtStart || !isSharingEnabled()) return;
      const elapsed = (timestamp: number | null) =>
        timestamp === null ? null : Math.max(0, timestamp - startedAtMs);
      await submit({
        schemaVersion: RECOGNITION_HEALTH_SCHEMA_VERSION,
        release: APP_RELEASE,
        platform,
        sourceCurrency,
        timeToReady: bucketTime(elapsed(readyAtMs)),
        timeToFirstDetectedPrice: bucketTime(elapsed(detectedAtMs)),
        timeToFirstFocusedPrice: bucketTime(elapsed(focusedAtMs)),
        recognitionPassCount: bucketCount(recognitionPassCount),
        missCount: bucketCount(missCount),
        focusChangeCount: bucketCount(focusChangeCount),
        stableDetectionCount: bucketCount(stableDetectionCount),
        terminalOutcome,
        errorFamily
      });
    }
  };
}

type RecognitionHealthFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export async function submitRecognitionHealthSummary(
  summary: RecognitionHealthSummary,
  request: RecognitionHealthFetch = fetch
): Promise<void> {
  try {
    await request("/api/recognition-health", {
      method: "POST",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(summary)
    });
  } catch {
    // Recognition-health is best effort: failures are never queued or retried.
  }
}
