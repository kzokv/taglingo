import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

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

function sqliteD1(database: DatabaseSync): D1Database {
  return {
    prepare(query) {
      let values: SQLInputValue[] = [];
      const prepared: D1PreparedStatement = {
        bind(...nextValues) {
          values = nextValues as SQLInputValue[];
          return prepared;
        },
        async first<T>() {
          return (database.prepare(query).get(...values) as T | undefined) ?? null;
        },
        async run() {
          database.prepare(query).run(...values);
          return { success: true };
        }
      };
      return prepared;
    }
  };
}

function migratedRecognitionHealthDatabase(): DatabaseSync {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      join(process.cwd(), "migrations/0003_recognition_health.sql"),
      "utf8"
    )
  );
  sqlite.exec(
    readFileSync(
      join(process.cwd(), "migrations/0004_recognition_health_governance.sql"),
      "utf8"
    )
  );
  return sqlite;
}

function recognitionHealthSummary() {
  return {
    schemaVersion: 1 as const,
    release: APP_RELEASE,
    platform: "other" as const,
    sourceCurrency: "JPY" as const,
    timeToReady: "under-1s" as const,
    timeToFirstDetectedPrice: "not-reached" as const,
    timeToFirstFocusedPrice: "not-reached" as const,
    recognitionPassCount: "1" as const,
    missCount: "1" as const,
    focusChangeCount: "0" as const,
    stableDetectionCount: "0" as const,
    terminalOutcome: "recognition-ended-without-stable-price" as const,
    errorFamily: "none" as const
  };
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

  it("progressively removes dimensions and returns one non-overlapping thresholded level", async () => {
    const audit = statement();
    const detailed = statement();
    detailed.first = vi.fn().mockResolvedValue({
      cell_count: 4,
      reportable_cell_count: 2
    });
    const withoutRelease = statement();
    withoutRelease.first = vi.fn().mockResolvedValue({
      cell_count: 3,
      reportable_cell_count: 2
    });
    const sourceCurrencyOnly = statement();
    sourceCurrencyOnly.first = vi.fn().mockResolvedValue({
      cell_count: 1,
      reportable_cell_count: 1
    });
    const cells = statement();
    cells.first = vi.fn().mockResolvedValue({
      cells: JSON.stringify([
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
      ])
    });
    const database: D1Database = {
      prepare: vi
        .fn()
        .mockReturnValueOnce(audit)
        .mockReturnValueOnce(detailed)
        .mockReturnValueOnce(withoutRelease)
        .mockReturnValueOnce(sourceCurrencyOnly)
        .mockReturnValueOnce(cells)
    };
    const store = createD1RecognitionHealthAggregateStore(database);

    const report = await store.report({
      operator: "user_operator",
      purpose: "reliability",
      fromDay: "2026-07-29",
      throughDay: "2026-08-04",
      requestedAt: "2026-08-04T09:30:00.000Z"
    });

    expect(report).toEqual({
      purpose: "reliability",
      window: { fromDay: "2026-07-29", throughDay: "2026-08-04" },
      dimensions: ["sourceCurrency"],
      cells: [expect.objectContaining({ sourceCurrency: "JPY", summaryCount: 34 })]
    });
    expect(vi.mocked(database.prepare).mock.calls[0][0]).toContain(
      "recognition_health_operator_audit"
    );
    expect(audit.bind).toHaveBeenCalledWith(
      "2026-08-04T09:30:00.000Z",
      "user_operator",
      "reliability",
      "2026-07-29",
      "2026-08-04"
    );
    const reportSql = vi.mocked(database.prepare).mock.calls[4][0];
    expect(reportSql).toContain("HAVING SUM(summary_count) >= ?3");
    expect(reportSql).toContain("source_currency");
    expect(reportSql).not.toContain("release AS release");
    expect(cells.bind).toHaveBeenCalledWith("2026-07-29", "2026-08-04", 30);
  });

  it("expires aggregate cells and access audits older than ninety days without ingestion", async () => {
    const aggregates = statement();
    const audits = statement();
    const database: D1Database = {
      prepare: vi
        .fn()
        .mockReturnValueOnce(aggregates)
        .mockReturnValueOnce(audits)
    };
    const store = createD1RecognitionHealthAggregateStore(database);

    await store.expire("2026-08-04");

    expect(vi.mocked(database.prepare).mock.calls[0][0]).toContain(
      "DELETE FROM recognition_health_daily_aggregates"
    );
    expect(vi.mocked(database.prepare).mock.calls[1][0]).toContain(
      "DELETE FROM recognition_health_operator_audit"
    );
    expect(aggregates.bind).toHaveBeenCalledWith("2026-05-06");
    expect(audits.bind).toHaveBeenCalledWith("2026-05-06");
  });

  it("expires the exact ninety-day boundary while retaining the next UTC day", async () => {
    const sqlite = migratedRecognitionHealthDatabase();
    const store = createD1RecognitionHealthAggregateStore(sqliteD1(sqlite));
    const summary = recognitionHealthSummary();
    await store.increment(summary, "2026-05-06");
    await store.increment(summary, "2026-05-07");
    sqlite
      .prepare(
        `INSERT INTO recognition_health_operator_audit (
           requested_at, operator, purpose, from_day, through_day
         ) VALUES (?1, 'user_operator', 'reliability', ?2, ?2)`
      )
      .run("2026-05-06T23:59:59.000Z", "2026-05-06");
    sqlite
      .prepare(
        `INSERT INTO recognition_health_operator_audit (
           requested_at, operator, purpose, from_day, through_day
         ) VALUES (?1, 'user_operator', 'reliability', ?2, ?2)`
      )
      .run("2026-05-07T00:00:00.000Z", "2026-05-07");

    await store.expire("2026-08-04");

    expect(
      sqlite
        .prepare(
          "SELECT aggregate_day FROM recognition_health_daily_aggregates ORDER BY aggregate_day"
        )
        .all()
    ).toEqual([{ aggregate_day: "2026-05-07" }]);
    expect(
      sqlite
        .prepare(
          "SELECT requested_at FROM recognition_health_operator_audit ORDER BY requested_at"
        )
        .all()
    ).toEqual([{ requested_at: "2026-05-07T00:00:00.000Z" }]);
    sqlite.close();
  });

  it("executes the threshold hierarchy against the migrated SQLite schema", async () => {
    const sqlite = migratedRecognitionHealthDatabase();
    const store = createD1RecognitionHealthAggregateStore(sqliteD1(sqlite));
    const summary = recognitionHealthSummary();
    for (let count = 0; count < 30; count += 1) {
      await store.increment(summary, "2026-08-04");
    }
    for (let count = 0; count < 29; count += 1) {
      await store.increment(
        { ...summary, sourceCurrency: "USD" },
        "2026-08-04"
      );
    }

    const report = await store.report({
      operator: "user_operator",
      purpose: "reliability",
      fromDay: "2026-07-29",
      throughDay: "2026-08-04",
      requestedAt: "2026-08-04T09:30:00.000Z"
    });

    expect(report.dimensions).toEqual([]);
    expect(report.cells).toEqual([
      expect.objectContaining({ summaryCount: 59 })
    ]);
    expect(report.cells[0]).not.toHaveProperty("sourceCurrency");
    sqlite.close();
  });
});
