import { describe, expect, it, vi } from "vitest";

import type {
  D1Database,
  D1PreparedStatement
} from "../fx/cloudflareInfrastructure";
import { APP_RELEASE } from "./recognitionHealth";
import { createD1RecognitionHealthAggregateStore } from "./cloudflareRecognitionHealth";

function statement(): D1PreparedStatement {
  const result: D1PreparedStatement = {
    bind: vi.fn(() => result),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ success: true })
  };
  return result;
}

describe("Cloudflare recognition-health aggregate storage", () => {
  it("expires old cells and increments one daily aggregate without an individual-summary table", async () => {
    const expiry = statement();
    const aggregate = statement();
    const database: D1Database = {
      prepare: vi.fn().mockReturnValueOnce(expiry).mockReturnValueOnce(aggregate)
    };
    const store = createD1RecognitionHealthAggregateStore(database);

    await store.increment(
      {
        schemaVersion: 1,
        release: APP_RELEASE,
        platform: "other",
        sourceCurrency: "JPY",
        timeToReady: "under-1s",
        timeToFirstDetectedPrice: "not-reached",
        timeToFirstFocusedPrice: "not-reached",
        recognitionPassCount: "1",
        missCount: "1",
        focusChangeCount: "0",
        stableDetectionCount: "0",
        terminalOutcome: "recognition-ended-without-stable-price",
        errorFamily: "none"
      },
      "2026-08-03"
    );

    expect(vi.mocked(database.prepare).mock.calls[0][0]).toContain(
      "DELETE FROM recognition_health_daily_aggregates"
    );
    expect(expiry.bind).toHaveBeenCalledWith("2026-05-05");
    expect(vi.mocked(database.prepare).mock.calls[1][0]).toContain(
      "ON CONFLICT"
    );
    expect(vi.mocked(database.prepare).mock.calls[1][0]).toContain(
      "summary_count = summary_count + 1"
    );
    expect(aggregate.bind).toHaveBeenCalledWith(
      "2026-08-03",
      1,
      APP_RELEASE,
      "other",
      "JPY",
      "under-1s",
      "not-reached",
      "not-reached",
      "1",
      "1",
      "0",
      "0",
      "recognition-ended-without-stable-price",
      "none"
    );
  });
});
