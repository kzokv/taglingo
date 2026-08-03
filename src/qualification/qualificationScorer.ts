import { deepFreeze } from "../domain/exactObject";
import {
  exactOneSidedLowerBound,
  exactOneSidedUpperBound
} from "./binomialStatistics";
import {
  QUALIFICATION_POLICY,
  isPositiveStratum
} from "./qualificationPolicy";
import { validateQualificationManifest } from "./qualificationManifest";
import {
  scorePerformanceQualification,
  type PerformanceQualificationEvidence,
  type PerformanceQualificationReport
} from "./qualificationPerformance";
import { validateFrozenTrialRecord } from "./qualificationTrial";
import type {
  FrozenTrialRecord,
  PositiveQualificationStratum,
  QualificationManifest,
  QualificationReport,
  QualificationStratum,
  TrialFailureReason,
  TrialTerminalOutcome
} from "./qualificationTypes";

export interface ProfileQualificationReport {
  readonly version: "profile-qualification-report.v1";
  readonly qualified: boolean;
  readonly evidenceAligned: boolean;
  readonly manualPriceEntryAvailable: true;
  readonly disposition: string;
  readonly reliability: QualificationReport;
  readonly performance: PerformanceQualificationReport;
}

function terminalFailure(
  outcome: TrialTerminalOutcome
): TrialFailureReason | null {
  switch (outcome) {
    case "completed":
      return null;
    case "crash":
    case "timeout":
    case "missing-telemetry":
      return outcome;
    case "excluded":
      return "undeclared-exclusion";
  }
}

function scoreRecord(record: FrozenTrialRecord): {
  readonly reasons: readonly TrialFailureReason[];
  readonly successfulLatencyMs: number | null;
  readonly hasIncorrectFocus: boolean;
  readonly hasCompleteTelemetry: boolean;
} {
  const reasons: TrialFailureReason[] = [];
  const terminal = terminalFailure(record.terminalOutcome);
  if (terminal) reasons.push(terminal);
  const hasCompleteTelemetry =
    record.terminalOutcome !== "missing-telemetry" &&
    record.timings.observationWindowMs >=
      QUALIFICATION_POLICY.observationWindowMs;
  if (
    record.timings.observationWindowMs <
    QUALIFICATION_POLICY.observationWindowMs
  ) {
    reasons.push("observation-too-short");
  }

  const transitionsInWindow = record.focusTransitions.filter(
    ({ atMs }) => atMs <= QUALIFICATION_POLICY.observationWindowMs
  );
  const hasIncorrectFocus = transitionsInWindow.some(
    ({ classification }) => classification === "incorrect"
  );
  if (hasIncorrectFocus) reasons.push("incorrect-focus");

  let successfulLatencyMs: number | null = null;
  if (isPositiveStratum(record.stratum)) {
    const firstExpected = transitionsInWindow
      .filter(({ classification }) => classification === "expected")
      .reduce<number | null>(
        (earliest, { atMs }) =>
          earliest === null || atMs < earliest ? atMs : earliest,
        null
      );
    if (
      firstExpected === null ||
      firstExpected > QUALIFICATION_POLICY.focusAndGeometryDeadlineMs
    ) {
      reasons.push("missing-or-late-focus");
    } else {
      successfulLatencyMs = firstExpected;
    }
    if (record.geometry === null) {
      reasons.push("missing-geometry");
    } else if (
      record.timings.geometryMs === null ||
      record.timings.geometryMs >
        QUALIFICATION_POLICY.focusAndGeometryDeadlineMs
    ) {
      reasons.push("late-geometry");
    } else if (
      !record.geometry.oneToOne ||
      record.geometry.iou <= QUALIFICATION_POLICY.minimumGeometryIouExclusive
    ) {
      reasons.push("failed-geometry");
    }
  }

  return {
    reasons,
    successfulLatencyMs,
    hasIncorrectFocus,
    hasCompleteTelemetry
  };
}

function percentile(
  sorted: readonly number[],
  probability: number
): number | null {
  if (sorted.length === 0) return null;
  const index = Math.ceil(probability * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function scoreQualification(
  manifest: QualificationManifest,
  records: readonly FrozenTrialRecord[]
): QualificationReport {
  validateQualificationManifest(manifest);
  const byFixture = new Map<string, FrozenTrialRecord>();
  for (const record of records) {
    if (byFixture.has(record.fixtureId)) {
      throw new Error(
        `One independent trial is allowed for fixture ${record.fixtureId}; replays do not increase the denominator.`
      );
    }
    byFixture.set(
      record.fixtureId,
      validateFrozenTrialRecord(manifest, record)
    );
  }

  const positiveByStratum = Object.fromEntries(
    QUALIFICATION_POLICY.positiveStrata.map((stratum) => [
      stratum,
      {
        successes: 0,
        total: QUALIFICATION_POLICY.requiredStratumCounts[stratum],
        required: QUALIFICATION_POLICY.requiredPositiveStratumSuccesses
      }
    ])
  ) as Record<
    PositiveQualificationStratum,
    { successes: number; total: number; required: number }
  >;
  const observedPositiveByStratum = Object.fromEntries(
    QUALIFICATION_POLICY.positiveStrata.map((stratum) => [stratum, 0])
  ) as Record<PositiveQualificationStratum, number>;
  let positiveSuccesses = 0;
  let observedPositiveSessions = 0;
  let negativeSuccesses = 0;
  let safetySessions = 0;
  let incorrectFocusedPrices = 0;
  const successfulLatencies: number[] = [];
  const failures: Array<{
    fixtureId: string;
    stratum: QualificationStratum;
    reasons: readonly TrialFailureReason[];
  }> = [];

  for (const fixture of manifest.fixtures) {
    const record = byFixture.get(fixture.id);
    const result = record
      ? scoreRecord(record)
      : {
          reasons: ["missing-telemetry" as const],
          successfulLatencyMs: null,
          hasIncorrectFocus: false,
          hasCompleteTelemetry: false
        };
    if (result.hasCompleteTelemetry) {
      safetySessions += 1;
      if (result.hasIncorrectFocus) incorrectFocusedPrices += 1;
      if (isPositiveStratum(fixture.stratum)) {
        observedPositiveSessions += 1;
        observedPositiveByStratum[fixture.stratum] += 1;
      }
    }
    const succeeded = result.reasons.length === 0;
    if (isPositiveStratum(fixture.stratum)) {
      if (succeeded) {
        positiveSuccesses += 1;
        positiveByStratum[fixture.stratum].successes += 1;
        if (result.successfulLatencyMs !== null) {
          successfulLatencies.push(result.successfulLatencyMs);
        }
      }
    } else if (succeeded) {
      negativeSuccesses += 1;
    }
    if (!succeeded) {
      failures.push({
        fixtureId: fixture.id,
        stratum: fixture.stratum,
        reasons: result.reasons
      });
    }
  }

  successfulLatencies.sort((left, right) => left - right);
  const strataPass = QUALIFICATION_POLICY.positiveStrata.every(
    (stratum) =>
      positiveByStratum[stratum].successes >=
      QUALIFICATION_POLICY.requiredPositiveStratumSuccesses
  );
  const report: QualificationReport = {
    version: "qualification-report.v1",
    configuration: manifest.configuration,
    device: manifest.device,
    browser: manifest.browser,
    qualified:
      safetySessions === QUALIFICATION_POLICY.requiredSessions &&
      positiveSuccesses >= QUALIFICATION_POLICY.requiredPositiveSuccesses &&
      strataPass &&
      negativeSuccesses === QUALIFICATION_POLICY.requiredNegativeSuccesses &&
      incorrectFocusedPrices === 0,
    positive: {
      successes: positiveSuccesses,
      total: QUALIFICATION_POLICY.requiredStratumCounts[
        "clean-single-price"
      ] * QUALIFICATION_POLICY.positiveStrata.length,
      required: QUALIFICATION_POLICY.requiredPositiveSuccesses,
      byStratum: positiveByStratum
    },
    negative: {
      successes: negativeSuccesses,
      total: QUALIFICATION_POLICY.requiredNegativeSuccesses,
      required: QUALIFICATION_POLICY.requiredNegativeSuccesses
    },
    safety: {
      incorrectFocusedPrices,
      sessions: safetySessions,
      requiredSessions: QUALIFICATION_POLICY.requiredSessions,
      statement:
        incorrectFocusedPrices === 0
          ? `zero observed in ${safetySessions}`
          : `${incorrectFocusedPrices} observed in ${safetySessions}`
    },
    confidence: {
      level: QUALIFICATION_POLICY.confidenceLevel,
      positiveSuccessLowerBound: exactOneSidedLowerBound(
        positiveSuccesses,
        observedPositiveSessions,
        QUALIFICATION_POLICY.confidenceLevel
      ),
      positiveStratumLowerBounds: Object.fromEntries(
        QUALIFICATION_POLICY.positiveStrata.map((stratum) => [
          stratum,
          exactOneSidedLowerBound(
            positiveByStratum[stratum].successes,
            observedPositiveByStratum[stratum],
            QUALIFICATION_POLICY.confidenceLevel
          )
        ])
      ) as Record<PositiveQualificationStratum, number | null>,
      incorrectFocusUpperBound: exactOneSidedUpperBound(
        incorrectFocusedPrices,
        safetySessions,
        QUALIFICATION_POLICY.confidenceLevel
      )
    },
    successfulLatencyMs: {
      count: successfulLatencies.length,
      min: successfulLatencies[0] ?? null,
      p50: percentile(successfulLatencies, 0.5),
      p95: percentile(successfulLatencies, 0.95),
      max: successfulLatencies.at(-1) ?? null
    },
    failures
  };
  return deepFreeze(report);
}

export function scoreProfileQualification(
  manifest: QualificationManifest,
  records: readonly FrozenTrialRecord[],
  performanceEvidence: PerformanceQualificationEvidence | null = null
): ProfileQualificationReport {
  const reliability = scoreQualification(manifest, records);
  const performance = scorePerformanceQualification(
    manifest,
    performanceEvidence
  );
  const reliabilityFailures = new Set(
    reliability.failures.map(({ fixtureId }) => fixtureId)
  );
  const performanceByFixture = new Map(
    performanceEvidence?.sceneRun.trials.map((trial) => [
      trial.fixtureId,
      trial
    ]) ?? []
  );
  const recordsByFixture = new Map(
    records.map((record) => [record.fixtureId, record])
  );
  const evidenceAligned =
    performanceEvidence !== null &&
    manifest.fixtures.every((fixture) => {
      if (!isPositiveStratum(fixture.stratum)) return true;
      const reliabilitySucceeded = !reliabilityFailures.has(fixture.id);
      if (!reliabilitySucceeded) return true;
      const trial = performanceByFixture.get(fixture.id);
      const record = recordsByFixture.get(fixture.id);
      const firstExpectedFocusMs = record?.focusTransitions
        .filter(({ classification }) => classification === "expected")
        .reduce<number | null>(
          (earliest, { atMs }) =>
            earliest === null || atMs < earliest ? atMs : earliest,
          null
        );
      return (
        trial?.focusOutcome === "focused" &&
        trial.focusedPriceLatencyMs === firstExpectedFocusMs
      );
    });
  const qualified =
    reliability.qualified &&
    performance.performanceEligible &&
    evidenceAligned;
  return deepFreeze({
    version: "profile-qualification-report.v1",
    qualified,
    evidenceAligned,
    manualPriceEntryAvailable: true,
    disposition: qualified
      ? "Reliability and physical-device performance gates pass independently for this profile and platform."
      : "Camera profile is ineligible on this platform; Manual Price Entry remains available.",
    reliability,
    performance
  });
}
