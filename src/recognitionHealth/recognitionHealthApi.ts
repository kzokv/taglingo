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

export const RECOGNITION_HEALTH_MINIMUM_REPORTABLE_SUMMARIES = 30 as const;

export const RECOGNITION_HEALTH_REPORT_PURPOSES = [
  "reliability",
  "regression",
  "error-health",
  "camera-supported-evidence"
] as const;

export type RecognitionHealthReportPurpose =
  (typeof RECOGNITION_HEALTH_REPORT_PURPOSES)[number];

export type RecognitionHealthReportDimension =
  | "release"
  | "platform"
  | "sourceCurrency";

export interface RecognitionHealthReportCell
  extends Omit<
    RecognitionHealthSummary,
    "schemaVersion" | "release" | "platform" | "sourceCurrency"
  > {
  release?: string;
  platform?: RecognitionHealthSummary["platform"];
  sourceCurrency?: RecognitionHealthSummary["sourceCurrency"];
  summaryCount: number;
}

export interface RecognitionHealthReport {
  purpose: RecognitionHealthReportPurpose;
  window: { fromDay: string; throughDay: string };
  dimensions: RecognitionHealthReportDimension[];
  cells: RecognitionHealthReportCell[];
}

export interface RecognitionHealthGovernanceStore {
  expire(throughDay: string): Promise<void>;
  report(request: {
    operator: string;
    purpose: RecognitionHealthReportPurpose;
    fromDay: string;
    throughDay: string;
    requestedAt: string;
  }): Promise<RecognitionHealthReport>;
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

function reportResponse(report: RecognitionHealthReport): Response {
  return Response.json(report, {
    headers: { "cache-control": "private, no-store" }
  });
}

function isThresholdedReport(
  report: RecognitionHealthReport,
  expected: {
    purpose: RecognitionHealthReportPurpose;
    fromDay: string;
    throughDay: string;
  }
): boolean {
  return (
    report.purpose === expected.purpose &&
    report.window.fromDay === expected.fromDay &&
    report.window.throughDay === expected.throughDay &&
    new Set(report.dimensions).size === report.dimensions.length &&
    report.dimensions.every((dimension) =>
      ["release", "platform", "sourceCurrency"].includes(dimension)
    ) &&
    report.cells.every(
      (cell) =>
        Number.isInteger(cell.summaryCount) &&
        cell.summaryCount >= RECOGNITION_HEALTH_MINIMUM_REPORTABLE_SUMMARIES
    )
  );
}

function rollingSevenDayWindow(through: Date): {
  fromDay: string;
  throughDay: string;
} {
  const throughDay = through.toISOString().slice(0, 10);
  const from = new Date(`${throughDay}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - 6);
  return { fromDay: from.toISOString().slice(0, 10), throughDay };
}

export function createRecognitionHealthHandler({
  aggregates,
  governance,
  identifyOperator = async () => null,
  authorizeMaintenance = async () => false,
  ingestionEnabled,
  now = () => new Date()
}: {
  aggregates: RecognitionHealthAggregateStore;
  governance?: RecognitionHealthGovernanceStore;
  identifyOperator?: (request: Request) => Promise<string | null>;
  authorizeMaintenance?: (request: Request) => Promise<boolean>;
  ingestionEnabled: () => boolean;
  now?: () => Date;
}) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "GET") {
      if (!governance) return response(404);
      const operator = await identifyOperator(request);
      if (!operator) return response(403);
      const url = new URL(request.url);
      const purpose = url.searchParams.get("purpose");
      if (
        [...url.searchParams.keys()].some((key) => key !== "purpose") ||
        !includes(RECOGNITION_HEALTH_REPORT_PURPOSES, purpose)
      ) {
        return response(400);
      }
      const requestedAt = now();
      const window = rollingSevenDayWindow(requestedAt);
      const report = await governance.report({
        operator,
        purpose,
        ...window,
        requestedAt: requestedAt.toISOString()
      });
      return isThresholdedReport(report, { purpose, ...window })
        ? reportResponse(report)
        : response(503);
    }
    if (request.method === "DELETE") {
      if (!governance) return response(404);
      if (!(await authorizeMaintenance(request))) return response(403);
      await governance.expire(now().toISOString().slice(0, 10));
      return response(204);
    }
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
