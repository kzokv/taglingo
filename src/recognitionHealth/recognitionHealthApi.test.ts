import { describe, expect, it, vi } from "vitest";

import {
  APP_RELEASE,
  type RecognitionHealthSummary
} from "./recognitionHealth";
import {
  RECOGNITION_HEALTH_MINIMUM_REPORTABLE_SUMMARIES,
  createRecognitionHealthHandler,
  isRecognitionHealthSummary,
  type RecognitionHealthAggregateStore,
  type RecognitionHealthGovernanceStore
} from "./recognitionHealthApi";

const VALID_SUMMARY: RecognitionHealthSummary = {
  schemaVersion: 1,
  release: APP_RELEASE,
  platform: "android-chrome",
  sourceCurrency: "JPY",
  timeToReady: "5-to-15s",
  timeToFirstDetectedPrice: "1-to-5s",
  timeToFirstFocusedPrice: "5-to-15s",
  recognitionPassCount: "6-to-20",
  missCount: "2-to-5",
  focusChangeCount: "1",
  stableDetectionCount: "2-to-5",
  terminalOutcome: "focused-price-obtained",
  errorFamily: "none"
};

function request(body: unknown, headers: HeadersInit = {}) {
  return new Request("https://taglingo.example/api/recognition-health", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

function store(): RecognitionHealthAggregateStore {
  return { increment: vi.fn().mockResolvedValue(undefined) };
}

function governanceStore(): RecognitionHealthGovernanceStore {
  return {
    expire: vi.fn().mockResolvedValue(undefined),
    report: vi.fn().mockResolvedValue({
      purpose: "reliability",
      window: { fromDay: "2026-07-29", throughDay: "2026-08-04" },
      dimensions: ["sourceCurrency"],
      cells: [
        {
          sourceCurrency: "JPY",
          timeToReady: "1-to-5s",
          timeToFirstDetectedPrice: "1-to-5s",
          timeToFirstFocusedPrice: "5-to-15s",
          recognitionPassCount: "6-to-20",
          missCount: "2-to-5",
          focusChangeCount: "1",
          stableDetectionCount: "2-to-5",
          terminalOutcome: "focused-price-obtained",
          errorFamily: "none",
          summaryCount: 34
        }
      ]
    })
  };
}

describe("recognition-health ingestion contract", () => {
  it("publishes the privacy threshold used by every reporting boundary", () => {
    expect(RECOGNITION_HEALTH_MINIMUM_REPORTABLE_SUMMARIES).toBe(30);
  });

  it("accepts the exact allowlisted schema and aggregates it without retaining a request", async () => {
    const aggregates = store();
    const handle = createRecognitionHealthHandler({
      aggregates,
      ingestionEnabled: () => true,
      now: () => new Date("2026-08-03T23:59:59.000Z")
    });

    const response = await handle(request(VALID_SUMMARY));

    expect(response.status).toBe(204);
    expect(aggregates.increment).toHaveBeenCalledWith(
      VALID_SUMMARY,
      "2026-08-03"
    );
  });

  it("returns only a named operator's audited thresholded seven-day report", async () => {
    const governance = governanceStore();
    const handle = createRecognitionHealthHandler({
      aggregates: store(),
      governance,
      identifyOperator: async () => "user_operator",
      ingestionEnabled: () => true,
      now: () => new Date("2026-08-04T09:30:00.000Z")
    });

    const response = await handle(
      new Request(
        "https://taglingo.example/api/recognition-health?purpose=reliability"
      )
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      purpose: "reliability",
      window: { fromDay: "2026-07-29", throughDay: "2026-08-04" },
      dimensions: ["sourceCurrency"],
      cells: [expect.objectContaining({ summaryCount: 34 })]
    });
    expect(governance.report).toHaveBeenCalledWith({
      operator: "user_operator",
      purpose: "reliability",
      fromDay: "2026-07-29",
      throughDay: "2026-08-04",
      requestedAt: "2026-08-04T09:30:00.000Z"
    });
  });

  it("fails closed instead of exposing a suppressed count from storage", async () => {
    const governance = governanceStore();
    vi.mocked(governance.report).mockResolvedValue({
      purpose: "reliability",
      window: { fromDay: "2026-07-29", throughDay: "2026-08-04" },
      dimensions: [],
      cells: [
        {
          timeToReady: "1-to-5s",
          timeToFirstDetectedPrice: "1-to-5s",
          timeToFirstFocusedPrice: "5-to-15s",
          recognitionPassCount: "6-to-20",
          missCount: "2-to-5",
          focusChangeCount: "1",
          stableDetectionCount: "2-to-5",
          terminalOutcome: "focused-price-obtained",
          errorFamily: "none",
          summaryCount: 29
        }
      ]
    });
    const handle = createRecognitionHealthHandler({
      aggregates: store(),
      governance,
      identifyOperator: async () => "user_operator",
      ingestionEnabled: () => true,
      now: () => new Date("2026-08-04T09:30:00.000Z")
    });

    const response = await handle(
      new Request(
        "https://taglingo.example/api/recognition-health?purpose=reliability"
      )
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
  });

  it("runs retention only through an authorized scheduled-maintenance request", async () => {
    const governance = governanceStore();
    const handle = createRecognitionHealthHandler({
      aggregates: store(),
      governance,
      authorizeMaintenance: async () => true,
      ingestionEnabled: () => true,
      now: () => new Date("2026-08-04T23:59:00.000Z")
    });

    const response = await handle(
      new Request("https://taglingo.example/api/recognition-health", {
        method: "DELETE"
      })
    );

    expect(response.status).toBe(204);
    expect(governance.expire).toHaveBeenCalledWith("2026-08-04");
  });

  it("fails closed when named operator or maintenance authorization is absent", async () => {
    const governance = governanceStore();
    const handle = createRecognitionHealthHandler({
      aggregates: store(),
      governance,
      ingestionEnabled: () => true
    });

    const [report, retention] = await Promise.all([
      handle(
        new Request(
          "https://taglingo.example/api/recognition-health?purpose=reliability"
        )
      ),
      handle(
        new Request("https://taglingo.example/api/recognition-health", {
          method: "DELETE"
        })
      )
    ]);

    expect(report.status).toBe(403);
    expect(retention.status).toBe(403);
    expect(governance.report).not.toHaveBeenCalled();
    expect(governance.expire).not.toHaveBeenCalled();
  });

  it.each([
    "purpose=engagement",
    "purpose=reliability&fromDay=2026-01-01",
    "purpose=reliability&platform=other",
    ""
  ])("rejects unsupported report query %s", async (query) => {
    const governance = governanceStore();
    const response = await createRecognitionHealthHandler({
      aggregates: store(),
      governance,
      identifyOperator: async () => "user_operator",
      ingestionEnabled: () => true
    })(
      new Request(
        `https://taglingo.example/api/recognition-health?${query}`
      )
    );

    expect(response.status).toBe(400);
    expect(governance.report).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown field", { ...VALID_SUMMARY, targetCurrency: "USD" }],
    ["unknown platform", { ...VALID_SUMMARY, platform: "ios-chrome" }],
    ["unknown release", { ...VALID_SUMMARY, release: "shopper-note" }],
    ["exact timing", { ...VALID_SUMMARY, timeToReady: 4_213 }],
    ["free-form error", { ...VALID_SUMMARY, errorFamily: "model said boom" }],
    ["inconsistent outcome", { ...VALID_SUMMARY, errorFamily: "unexpected" }]
  ])("rejects %s", async (_case, payload) => {
    const aggregates = store();
    const handle = createRecognitionHealthHandler({
      aggregates,
      ingestionEnabled: () => true
    });

    const response = await handle(request(payload));

    expect(response.status).toBe(400);
    expect(aggregates.increment).not.toHaveBeenCalled();
  });

  it.each([
    "accountToken",
    "cookie",
    "identifier",
    "url",
    "referrer",
    "locale",
    "membershipState",
    "targetCurrencies",
    "price",
    "coordinates",
    "exactTime",
    "message",
    "stack"
  ])("rejects prohibited field %s", async (field) => {
    expect(isRecognitionHealthSummary({ ...VALID_SUMMARY, [field]: "x" }))
      .toBe(false);
  });

  it("rejects credential-bearing requests before parsing or aggregation", async () => {
    const aggregates = store();
    const handle = createRecognitionHealthHandler({
      aggregates,
      ingestionEnabled: () => true
    });

    const [cookieResponse, tokenResponse] = await Promise.all([
      handle(request(VALID_SUMMARY, { cookie: "session=secret" })),
      handle(request(VALID_SUMMARY, { authorization: "Bearer secret" }))
    ]);

    expect(cookieResponse.status).toBe(400);
    expect(tokenResponse.status).toBe(400);
    expect(aggregates.increment).not.toHaveBeenCalled();
  });

  it("supports a server-side kill switch without aggregation", async () => {
    const aggregates = store();
    const response = await createRecognitionHealthHandler({
      aggregates,
      ingestionEnabled: () => false
    })(request(VALID_SUMMARY));

    expect(response.status).toBe(503);
    expect(aggregates.increment).not.toHaveBeenCalled();
  });
});
