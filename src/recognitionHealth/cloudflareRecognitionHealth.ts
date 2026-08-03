import type { D1Database } from "../fx/cloudflareInfrastructure";
import type { RecognitionHealthAggregateStore } from "./recognitionHealthApi";

function retentionCutoff(day: string): string {
  const cutoff = new Date(`${day}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  return cutoff.toISOString().slice(0, 10);
}

export function createD1RecognitionHealthAggregateStore(
  database: D1Database
): RecognitionHealthAggregateStore {
  return {
    async increment(summary, day) {
      const expired = await database
        .prepare(
          `DELETE FROM recognition_health_daily_aggregates
            WHERE aggregate_day < ?1`
        )
        .bind(retentionCutoff(day))
        .run();
      if (!expired.success) {
        throw new Error("D1 did not expire recognition-health aggregates.");
      }

      const incremented = await database
        .prepare(
          `INSERT INTO recognition_health_daily_aggregates (
             aggregate_day, schema_version, release, platform,
             source_currency, time_to_ready, time_to_first_detected_price,
             time_to_first_focused_price, recognition_pass_count, miss_count,
             focus_change_count, stable_detection_count, terminal_outcome,
             error_family, summary_count
           ) VALUES (
             ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 1
           )
           ON CONFLICT (
             aggregate_day, schema_version, release, platform,
             source_currency, time_to_ready, time_to_first_detected_price,
             time_to_first_focused_price, recognition_pass_count, miss_count,
             focus_change_count, stable_detection_count, terminal_outcome,
             error_family
           ) DO UPDATE SET summary_count = summary_count + 1`
        )
        .bind(
          day,
          summary.schemaVersion,
          summary.release,
          summary.platform,
          summary.sourceCurrency,
          summary.timeToReady,
          summary.timeToFirstDetectedPrice,
          summary.timeToFirstFocusedPrice,
          summary.recognitionPassCount,
          summary.missCount,
          summary.focusChangeCount,
          summary.stableDetectionCount,
          summary.terminalOutcome,
          summary.errorFamily
        )
        .run();
      if (!incremented.success) {
        throw new Error("D1 did not aggregate recognition health.");
      }
    }
  };
}
