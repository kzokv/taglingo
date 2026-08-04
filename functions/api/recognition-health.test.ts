import { describe, expect, it, vi } from "vitest";

import type {
  D1Database,
  D1PreparedStatement
} from "../../src/fx/cloudflareInfrastructure";
import { APP_RELEASE } from "../../src/recognitionHealth/recognitionHealth";
import { onRequest } from "./recognition-health";

function statement(success: boolean): D1PreparedStatement {
  const prepared: D1PreparedStatement = {
    bind: vi.fn(() => prepared),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ success })
  };
  return prepared;
}

function request(): Request {
  return new Request("https://taglingo.example/api/recognition-health", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schemaVersion: 1,
      release: APP_RELEASE,
      platform: "other",
      sourceCurrency: "JPY",
      timeToReady: "1-to-5s",
      timeToFirstDetectedPrice: "not-reached",
      timeToFirstFocusedPrice: "not-reached",
      recognitionPassCount: "2-to-5",
      missCount: "1",
      focusChangeCount: "0",
      stableDetectionCount: "0",
      terminalOutcome: "recognition-ended-without-stable-price",
      errorFamily: "none"
    })
  });
}

function environment(database: D1Database, enabled = "true") {
  return {
    DB: database,
    CLERK_AUTHORIZED_PARTIES: "https://taglingo.example",
    CLERK_PUBLISHABLE_KEY: "unused-for-ingestion",
    CLERK_SECRET_KEY: "unused-for-ingestion",
    RECOGNITION_HEALTH_INGESTION_ENABLED: enabled
  };
}

describe("recognition-health Pages deployment contract", () => {
  it("wires the server kill switch before D1 access", async () => {
    const database: D1Database = { prepare: vi.fn() };

    const response = await onRequest({
      request: request(),
      env: environment(database, "false")
    });

    expect(response.status).toBe(503);
    expect(database.prepare).not.toHaveBeenCalled();
  });

  it("returns a detail-free failure without application logging", async () => {
    const database: D1Database = {
      prepare: vi
        .fn()
        .mockReturnValueOnce(statement(true))
        .mockReturnValueOnce(statement(false))
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await onRequest({
      request: request(),
      env: environment(database)
    });

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
    expect(log).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
