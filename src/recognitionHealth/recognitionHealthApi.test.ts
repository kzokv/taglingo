import { describe, expect, it, vi } from "vitest";

import {
  APP_RELEASE,
  type RecognitionHealthSummary
} from "./recognitionHealth";
import {
  createRecognitionHealthHandler,
  isRecognitionHealthSummary,
  type RecognitionHealthAggregateStore
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

describe("recognition-health ingestion contract", () => {
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
