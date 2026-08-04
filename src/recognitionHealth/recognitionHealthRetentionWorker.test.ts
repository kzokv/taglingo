import { describe, expect, it, vi } from "vitest";

import type {
  D1Database,
  D1PreparedStatement
} from "../fx/cloudflareInfrastructure";
import worker from "./recognitionHealthRetentionWorker";

function statement(): D1PreparedStatement {
  const prepared: D1PreparedStatement = {
    bind: vi.fn(() => prepared),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ success: true })
  };
  return prepared;
}

describe("recognition-health retention schedule", () => {
  it("expires governed storage using the scheduler's UTC day", async () => {
    const aggregates = statement();
    const audits = statement();
    const database: D1Database = {
      prepare: vi
        .fn()
        .mockReturnValueOnce(aggregates)
        .mockReturnValueOnce(audits)
    };

    await worker.scheduled(
      { scheduledTime: Date.parse("2026-08-04T03:17:00.000Z") },
      { DB: database }
    );

    expect(aggregates.bind).toHaveBeenCalledWith("2026-05-06");
    expect(audits.bind).toHaveBeenCalledWith("2026-05-06");
  });
});
