import type { D1Database } from "../fx/cloudflareInfrastructure";
import { hasExactKeys } from "../domain/exactObject";
import {
  APP_RELEASE,
  RECOGNITION_HEALTH_SCHEMA_VERSION,
  type RecognitionHealthSummary
} from "./recognitionHealth";
import {
  RECOGNITION_HEALTH_MINIMUM_REPORTABLE_SUMMARIES,
  isRecognitionHealthSummary,
  type RecognitionHealthAggregateStore,
  type RecognitionHealthGovernanceStore,
  type RecognitionHealthReportCell,
  type RecognitionHealthReportDimension
} from "./recognitionHealthApi";

const METRICS = [
  ["time_to_ready", "timeToReady"],
  ["time_to_first_detected_price", "timeToFirstDetectedPrice"],
  ["time_to_first_focused_price", "timeToFirstFocusedPrice"],
  ["recognition_pass_count", "recognitionPassCount"],
  ["miss_count", "missCount"],
  ["focus_change_count", "focusChangeCount"],
  ["stable_detection_count", "stableDetectionCount"],
  ["terminal_outcome", "terminalOutcome"],
  ["error_family", "errorFamily"]
] as const;

const DIMENSIONS = {
  release: ["release", "release"],
  platform: ["platform", "platform"],
  sourceCurrency: ["source_currency", "sourceCurrency"]
} as const;

const REPORT_LEVELS: readonly (readonly RecognitionHealthReportDimension[])[] = [
  ["release", "platform", "sourceCurrency"],
  ["platform", "sourceCurrency"],
  ["sourceCurrency"],
  []
];

function groupedColumns(
  dimensions: readonly RecognitionHealthReportDimension[]
): readonly (readonly [string, string])[] {
  return [
    ...dimensions.map((dimension) => DIMENSIONS[dimension]),
    ...METRICS
  ];
}

function groupedCellSql(
  dimensions: readonly RecognitionHealthReportDimension[],
  thresholded: boolean
): string {
  const columns = groupedColumns(dimensions);
  return `SELECT ${columns
    .map(([column, alias]) => `${column} AS ${alias}`)
    .join(", ")}, SUM(summary_count) AS summaryCount
      FROM recognition_health_daily_aggregates
     WHERE aggregate_day BETWEEN ?1 AND ?2
     GROUP BY ${columns.map(([column]) => column).join(", ")}${
       thresholded ? "\n    HAVING SUM(summary_count) >= ?3" : ""
     }`;
}

function levelCoverageSql(
  dimensions: readonly RecognitionHealthReportDimension[]
): string {
  return `SELECT COUNT(*) AS cell_count,
                 COALESCE(SUM(
                   CASE WHEN summaryCount >= ?3 THEN 1 ELSE 0 END
                 ), 0) AS reportable_cell_count
            FROM (${groupedCellSql(dimensions, false)})`;
}

function reportCellsSql(
  dimensions: readonly RecognitionHealthReportDimension[]
): string {
  const jsonArguments = groupedColumns(dimensions)
    .map(([, alias]) => `'${alias}', ${alias}`)
    .concat("'summaryCount', summaryCount")
    .join(", ");
  return `SELECT COALESCE(json_group_array(json(cell)), '[]') AS cells
            FROM (
              SELECT json_object(${jsonArguments}) AS cell
                FROM (${groupedCellSql(dimensions, true)})
               ORDER BY ${groupedColumns(dimensions)
                 .map(([, alias]) => alias)
                 .join(", ")}
            )`;
}

function parseReportCells(
  raw: unknown,
  dimensions: readonly RecognitionHealthReportDimension[]
): RecognitionHealthReportCell[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === "string" ? raw : "null");
  } catch {
    parsed = null;
  }
  if (!Array.isArray(parsed)) {
    throw new Error("D1 returned an invalid recognition-health report.");
  }

  const keys = [
    ...dimensions,
    ...METRICS.map(([, alias]) => alias),
    "summaryCount"
  ];
  return parsed.map((cell: unknown) => {
    if (
      !hasExactKeys(cell, keys) ||
      !Number.isInteger(cell.summaryCount) ||
      (cell.summaryCount as number) <
        RECOGNITION_HEALTH_MINIMUM_REPORTABLE_SUMMARIES
    ) {
      throw new Error("D1 returned a suppressed recognition-health cell.");
    }
    const summary: RecognitionHealthSummary = {
      schemaVersion: RECOGNITION_HEALTH_SCHEMA_VERSION,
      release: (cell.release ?? APP_RELEASE) as typeof APP_RELEASE,
      platform: (cell.platform ?? "other") as RecognitionHealthSummary["platform"],
      sourceCurrency: (cell.sourceCurrency ?? "JPY") as RecognitionHealthSummary["sourceCurrency"],
      timeToReady: cell.timeToReady as RecognitionHealthSummary["timeToReady"],
      timeToFirstDetectedPrice:
        cell.timeToFirstDetectedPrice as RecognitionHealthSummary["timeToFirstDetectedPrice"],
      timeToFirstFocusedPrice:
        cell.timeToFirstFocusedPrice as RecognitionHealthSummary["timeToFirstFocusedPrice"],
      recognitionPassCount:
        cell.recognitionPassCount as RecognitionHealthSummary["recognitionPassCount"],
      missCount: cell.missCount as RecognitionHealthSummary["missCount"],
      focusChangeCount:
        cell.focusChangeCount as RecognitionHealthSummary["focusChangeCount"],
      stableDetectionCount:
        cell.stableDetectionCount as RecognitionHealthSummary["stableDetectionCount"],
      terminalOutcome:
        cell.terminalOutcome as RecognitionHealthSummary["terminalOutcome"],
      errorFamily: cell.errorFamily as RecognitionHealthSummary["errorFamily"]
    };
    if (!isRecognitionHealthSummary(summary)) {
      throw new Error("D1 returned an invalid recognition-health cell.");
    }
    return cell as unknown as RecognitionHealthReportCell;
  });
}

function retentionCutoff(day: string): string {
  const cutoff = new Date(`${day}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  return cutoff.toISOString().slice(0, 10);
}

export function createD1RecognitionHealthAggregateStore(
  database: D1Database
): RecognitionHealthAggregateStore & RecognitionHealthGovernanceStore {
  return {
    async increment(summary, day) {
      const expired = await database
        .prepare(
          `DELETE FROM recognition_health_daily_aggregates
            WHERE aggregate_day <= ?1`
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
    },

    async expire(throughDay) {
      const cutoff = retentionCutoff(throughDay);
      const aggregatesExpired = await database
        .prepare(
          `DELETE FROM recognition_health_daily_aggregates
            WHERE aggregate_day <= ?1`
        )
        .bind(cutoff)
        .run();
      if (!aggregatesExpired.success) {
        throw new Error("D1 did not expire recognition-health aggregates.");
      }
      const auditsExpired = await database
        .prepare(
          `DELETE FROM recognition_health_operator_audit
            WHERE substr(requested_at, 1, 10) <= ?1`
        )
        .bind(cutoff)
        .run();
      if (!auditsExpired.success) {
        throw new Error("D1 did not expire recognition-health access audits.");
      }
    },

    async report(request) {
      const audited = await database
        .prepare(
          `INSERT INTO recognition_health_operator_audit (
             requested_at, operator, purpose, from_day, through_day
           ) VALUES (?1, ?2, ?3, ?4, ?5)`
        )
        .bind(
          request.requestedAt,
          request.operator,
          request.purpose,
          request.fromDay,
          request.throughDay
        )
        .run();
      if (!audited.success) {
        throw new Error("D1 did not audit recognition-health operator access.");
      }

      let dimensions = REPORT_LEVELS[REPORT_LEVELS.length - 1];
      for (const level of REPORT_LEVELS) {
        const coverage = await database
          .prepare(levelCoverageSql(level))
          .bind(
            request.fromDay,
            request.throughDay,
            RECOGNITION_HEALTH_MINIMUM_REPORTABLE_SUMMARIES
          )
          .first<{ cell_count: number; reportable_cell_count: number }>();
        if (
          coverage &&
          Number.isInteger(coverage.cell_count) &&
          Number.isInteger(coverage.reportable_cell_count) &&
          (coverage.cell_count === 0 ||
            coverage.cell_count === coverage.reportable_cell_count)
        ) {
          dimensions = level;
          break;
        }
      }

      const result = await database
        .prepare(reportCellsSql(dimensions))
        .bind(
          request.fromDay,
          request.throughDay,
          RECOGNITION_HEALTH_MINIMUM_REPORTABLE_SUMMARIES
        )
        .first<{ cells: unknown }>();
      const cells = parseReportCells(result?.cells, dimensions);
      return {
        purpose: request.purpose,
        window: { fromDay: request.fromDay, throughDay: request.throughDay },
        dimensions: [...dimensions],
        cells
      };
    }
  };
}
