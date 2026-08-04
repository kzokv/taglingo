import { isCurrencyCode } from "../domain/currencies";
import { hasExactKeys } from "../domain/exactObject";
import {
  APP_RELEASE,
  RECOGNITION_HEALTH_COUNT_BUCKETS,
  RECOGNITION_HEALTH_ERROR_FAMILIES,
  RECOGNITION_HEALTH_PLATFORMS,
  RECOGNITION_HEALTH_SCHEMA_VERSION,
  RECOGNITION_HEALTH_TERMINAL_OUTCOMES,
  RECOGNITION_HEALTH_TIME_BUCKETS,
  type RecognitionHealthErrorFamily,
  type RecognitionHealthSummary,
  type RecognitionHealthTerminalOutcome
} from "./recognitionHealth";

export interface RecognitionHealthAggregateStore {
  increment(summary: RecognitionHealthSummary, day: string): Promise<void>;
}

const SUMMARY_KEYS = [
  "schemaVersion",
  "release",
  "platform",
  "sourceCurrency",
  "timeToReady",
  "timeToFirstDetectedPrice",
  "timeToFirstFocusedPrice",
  "recognitionPassCount",
  "missCount",
  "focusChangeCount",
  "stableDetectionCount",
  "terminalOutcome",
  "errorFamily"
] as const;

const includes = <T extends string>(
  values: readonly T[],
  value: unknown
): value is T =>
  typeof value === "string" && values.includes(value as T);

const allowedErrors: Record<
  RecognitionHealthTerminalOutcome,
  readonly RecognitionHealthErrorFamily[]
> = {
  "focused-price-obtained": ["none"],
  "entered-price-before-promotion": ["none"],
  "entered-price-after-promotion": ["none"],
  "closed-without-price": ["none"],
  "camera-permission-denied": ["camera-permission"],
  "camera-unavailable-or-interrupted": [
    "camera-unavailable",
    "camera-interrupted"
  ],
  "recognition-initialization-failed": ["recognition-initialization"],
  "recognition-ended-without-stable-price": ["none"],
  "unexpected-recognition-failure": ["recognition-runtime", "unexpected"]
};

export function isRecognitionHealthSummary(
  value: unknown
): value is RecognitionHealthSummary {
  if (!hasExactKeys(value, SUMMARY_KEYS)) return false;
  if (
    value.schemaVersion !== RECOGNITION_HEALTH_SCHEMA_VERSION ||
    value.release !== APP_RELEASE ||
    !includes(RECOGNITION_HEALTH_PLATFORMS, value.platform) ||
    !isCurrencyCode(value.sourceCurrency) ||
    !includes(RECOGNITION_HEALTH_TIME_BUCKETS, value.timeToReady) ||
    !includes(
      RECOGNITION_HEALTH_TIME_BUCKETS,
      value.timeToFirstDetectedPrice
    ) ||
    !includes(RECOGNITION_HEALTH_TIME_BUCKETS, value.timeToFirstFocusedPrice) ||
    !includes(RECOGNITION_HEALTH_COUNT_BUCKETS, value.recognitionPassCount) ||
    !includes(RECOGNITION_HEALTH_COUNT_BUCKETS, value.missCount) ||
    !includes(RECOGNITION_HEALTH_COUNT_BUCKETS, value.focusChangeCount) ||
    !includes(RECOGNITION_HEALTH_COUNT_BUCKETS, value.stableDetectionCount) ||
    !includes(RECOGNITION_HEALTH_TERMINAL_OUTCOMES, value.terminalOutcome) ||
    !includes(RECOGNITION_HEALTH_ERROR_FAMILIES, value.errorFamily)
  ) {
    return false;
  }
  return allowedErrors[value.terminalOutcome].includes(value.errorFamily);
}

function response(status: number): Response {
  return new Response(null, {
    status,
    headers: { "cache-control": "no-store" }
  });
}

export function createRecognitionHealthHandler({
  aggregates,
  ingestionEnabled,
  now = () => new Date()
}: {
  aggregates: RecognitionHealthAggregateStore;
  ingestionEnabled: () => boolean;
  now?: () => Date;
}) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return response(405);
    if (!ingestionEnabled()) return response(503);
    if (request.headers.has("authorization") || request.headers.has("cookie")) {
      return response(400);
    }
    if (
      request.headers.get("content-type")?.split(";", 1)[0] !==
      "application/json"
    ) {
      return response(415);
    }

    let payload: unknown;
    try {
      const body = await request.text();
      payload = body.length <= 2_048 ? JSON.parse(body) : null;
    } catch {
      payload = null;
    }
    if (!isRecognitionHealthSummary(payload)) return response(400);

    await aggregates.increment(payload, now().toISOString().slice(0, 10));
    return response(204);
  };
}
