import { deepFreeze } from "../domain/exactObject";
import {
  configurationMatches,
  validateQualificationManifest
} from "./qualificationManifest";
import { isPositiveStratum } from "./qualificationPolicy";
import type {
  QualificationBrowser,
  QualificationConfiguration,
  QualificationDevice,
  QualificationManifest
} from "./qualificationTypes";

export const QUALIFICATION_PERFORMANCE_POLICY = {
  network: { downMbps: 10, roundTripMs: 150 },
  requiredStartsPerCacheState: 30,
  requiredScenes: 299,
  requiredFocusedPositiveTrials: 108,
  requiredSustainedRuns: 3,
  readiness: {
    appShellAndManualEntryInteractiveP95Ms: 2_500,
    previewAfterPermissionP95Ms: 2_000,
    uncachedRecognitionReadyP95Ms: 30_000,
    cachedRecognitionReadyP95Ms: 3_000
  },
  sceneRun: {
    guidePassP95Ms: 1_000,
    discoveryPassP95Ms: 2_000,
    focusedPriceP95Ms: 5_000,
    searchingOrStabilizingGuideMaxIntervalMs: 1_500,
    searchingOrStabilizingDiscoveryMaxIntervalMs: 4_000,
    focusedGuideMaxIntervalMs: 2_000,
    focusedDiscoveryMaxIntervalMs: 5_000,
    minimumYieldMs: 250
  },
  resources: {
    firstInstallTransferMiB: 60,
    cachedProfileStorageMiB: 75,
    additionalPeakMemoryMiB: 300,
    minute2To10MemoryGrowthMiB: 25
  },
  sustained: {
    durationMs: 10 * 60 * 1_000,
    checkpointIntervalMs: 60_000,
    requiredCheckpointCount: 11,
    minimumWindowSamples: 3,
    minimumPreviewFps: 24,
    maximumLateRunSlowdownPercent: 25,
    maximumBatteryDrainPercentagePointsPerHour: 20
  }
} as const;

export type PerformanceEvidenceKind = "physical-device" | "simulation";
export type PerformanceEvidenceHash = `sha256:${string}`;

export interface StartupPerformanceMeasurement {
  readonly id: string;
  readonly appShellAndManualEntryInteractiveMs: number;
  readonly previewAfterPermissionMs: number;
  readonly recognitionReadyMs: number;
}

export interface ScenePerformanceTrial {
  readonly fixtureId: string;
  readonly trialId: string;
  readonly captureArtifactHash: PerformanceEvidenceHash;
  readonly capturedAt: string;
  readonly guidePassDurationsMs: readonly number[];
  readonly discoveryPassDurationsMs: readonly number[];
  readonly searchingOrStabilizingGuideIntervalsMs: readonly number[];
  readonly searchingOrStabilizingDiscoveryIntervalsMs: readonly number[];
  readonly yieldsBetweenPassesMs: readonly number[];
  readonly focusOutcome: "focused" | "not-focused";
  readonly focusedPriceLatencyMs: number | null;
  readonly focusedGuideIntervalsMs: readonly number[];
  readonly focusedDiscoveryIntervalsMs: readonly number[];
}

export interface SustainedPerformanceCheckpoint {
  readonly atMs: number;
  readonly previewFps: number;
  readonly recognitionDurationMs: number;
  readonly memoryMiB: number;
  readonly batteryDrainPercentagePoints: number;
  readonly crashes: number;
  readonly reloads: number;
  readonly thermalWarnings: number;
  readonly cameraInterruptions: number;
  readonly forcedRecoveries: number;
}

export interface SustainedPerformanceRun {
  readonly id: string;
  readonly captureArtifactHash: PerformanceEvidenceHash;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly cameraPreviewBaselineMiB: number;
  readonly checkpoints: readonly SustainedPerformanceCheckpoint[];
}

export interface PerformanceQualificationEvidence {
  readonly version: "qualification-performance-evidence.v1";
  readonly evidenceKind: PerformanceEvidenceKind;
  readonly configuration: QualificationConfiguration;
  readonly device: QualificationDevice;
  readonly browser: QualificationBrowser;
  readonly network: {
    readonly downMbps: number;
    readonly roundTripMs: number;
  };
  readonly starts: {
    readonly uncached: readonly StartupPerformanceMeasurement[];
    readonly cached: readonly StartupPerformanceMeasurement[];
  };
  readonly sceneRun: {
    readonly trials: readonly ScenePerformanceTrial[];
  };
  readonly resources: {
    readonly firstInstallTransferMiB: number;
    readonly cachedProfileStorageMiB: number;
  };
  readonly sustainedRuns: readonly SustainedPerformanceRun[];
}

export interface PerformanceGateResult {
  readonly id: string;
  readonly name: string;
  readonly actual: number | null;
  readonly limit: number;
  readonly comparison: "equal" | "at-most" | "at-least";
  readonly unit: string;
  readonly measurementPresent: boolean;
  readonly passed: boolean;
}

export interface StartupCohortReport {
  readonly sampleCount: number;
  readonly requiredSampleCount: number;
  readonly appShellAndManualEntryInteractiveP95Ms: number | null;
  readonly previewAfterPermissionP95Ms: number | null;
  readonly recognitionReadyP95Ms: number | null;
}

export interface SustainedRunReport {
  readonly id: string;
  readonly captureArtifactHash: PerformanceEvidenceHash;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly checkpointCount: number;
  readonly minimumPreviewFps: number | null;
  readonly minutes2To4RecognitionP95Ms: number | null;
  readonly finalTwoMinutesRecognitionP95Ms: number | null;
  readonly lateRunSlowdownPercent: number | null;
  readonly batteryDrainPercentagePointsPerHour: number | null;
  readonly additionalPeakMemoryMiB: number | null;
  readonly minute2To10MemoryGrowthMiB: number | null;
  readonly passed: boolean;
  readonly checks: readonly PerformanceGateResult[];
}

export interface PerformanceQualificationReport {
  readonly version: "qualification-performance-report.v1";
  readonly evidenceKind: PerformanceEvidenceKind | "missing";
  readonly configuration: QualificationConfiguration;
  readonly device: QualificationDevice;
  readonly browser: QualificationBrowser;
  readonly evidenceComplete: boolean;
  readonly meetsAllBudgets: boolean;
  readonly performanceEligible: boolean;
  readonly manualPriceEntryAvailable: true;
  readonly disposition: string;
  readonly startup: {
    readonly network: {
      readonly downMbps: number | null;
      readonly roundTripMs: number | null;
      readonly requiredDownMbps: number;
      readonly requiredRoundTripMs: number;
    };
    readonly uncached: StartupCohortReport;
    readonly cached: StartupCohortReport;
  };
  readonly sceneRun: {
    readonly sceneCount: number;
    readonly requiredSceneCount: number;
    readonly completeTrialCount: number;
    readonly uniqueMeasurementCount: number;
    readonly focusedPositiveTrialCount: number;
    readonly guidePassSampleCount: number;
    readonly discoveryPassSampleCount: number;
    readonly focusedPriceSampleCount: number;
    readonly guidePassP95Ms: number | null;
    readonly discoveryPassP95Ms: number | null;
    readonly focusedPriceP95Ms: number | null;
    readonly searchingOrStabilizingGuideMaxIntervalMs: number | null;
    readonly searchingOrStabilizingDiscoveryMaxIntervalMs: number | null;
    readonly focusedGuideMaxIntervalMs: number | null;
    readonly focusedDiscoveryMaxIntervalMs: number | null;
    readonly minimumYieldMs: number | null;
  };
  readonly resources: {
    readonly firstInstallTransferMiB: number | null;
    readonly cachedProfileStorageMiB: number | null;
    readonly additionalPeakMemoryMiB: number | null;
    readonly minute2To10MemoryGrowthMiB: number | null;
  };
  readonly sustainedRuns: readonly SustainedRunReport[];
  readonly checks: readonly PerformanceGateResult[];
  readonly failures: readonly PerformanceGateResult[];
}

function percentile(values: readonly number[], probability: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(probability * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function maximum(values: readonly number[]) {
  return values.length === 0 ? null : Math.max(...values);
}

function minimum(values: readonly number[]) {
  return values.length === 0 ? null : Math.min(...values);
}

function gate(
  id: string,
  name: string,
  actual: number | null,
  limit: number,
  comparison: PerformanceGateResult["comparison"],
  unit: string,
  measurementPresent = actual !== null
): PerformanceGateResult {
  const passed =
    measurementPresent &&
    actual !== null &&
    (comparison === "equal"
      ? actual === limit
      : comparison === "at-most"
        ? actual <= limit
        : actual >= limit);
  return {
    id,
    name,
    actual,
    limit,
    comparison,
    unit,
    measurementPresent,
    passed
  };
}

function assertFiniteNonNegative(values: readonly number[], description: string) {
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(`${description} must contain finite, non-negative measurements.`);
  }
}

function assertHash(value: string, description: string) {
  if (!/^sha256:[a-f\d]{64}$/u.test(value)) {
    throw new Error(`${description} requires a SHA-256 capture artifact hash.`);
  }
}

function assertEvidenceValues(evidence: PerformanceQualificationEvidence) {
  assertFiniteNonNegative(
    [
      evidence.network.downMbps,
      evidence.network.roundTripMs,
      evidence.resources.firstInstallTransferMiB,
      evidence.resources.cachedProfileStorageMiB
    ],
    "Performance evidence"
  );
  for (const cohort of [evidence.starts.uncached, evidence.starts.cached]) {
    for (const sample of cohort) {
      assertFiniteNonNegative(
        [
          sample.appShellAndManualEntryInteractiveMs,
          sample.previewAfterPermissionMs,
          sample.recognitionReadyMs
        ],
        `Startup measurement ${sample.id}`
      );
    }
  }
  for (const trial of evidence.sceneRun.trials) {
    assertHash(trial.captureArtifactHash, `Scene trial ${trial.trialId}`);
    if (!trial.trialId.trim() || !Number.isFinite(Date.parse(trial.capturedAt))) {
      throw new Error("Scene trials require an identity and capture timestamp.");
    }
    if (!["focused", "not-focused"].includes(trial.focusOutcome)) {
      throw new Error(`Unknown scene focus outcome for ${trial.trialId}.`);
    }
    assertFiniteNonNegative(
      [
        ...trial.guidePassDurationsMs,
        ...trial.discoveryPassDurationsMs,
        ...trial.searchingOrStabilizingGuideIntervalsMs,
        ...trial.searchingOrStabilizingDiscoveryIntervalsMs,
        ...trial.yieldsBetweenPassesMs,
        ...(trial.focusedPriceLatencyMs === null
          ? []
          : [trial.focusedPriceLatencyMs]),
        ...trial.focusedGuideIntervalsMs,
        ...trial.focusedDiscoveryIntervalsMs
      ],
      `Scene trial ${trial.trialId}`
    );
  }
  for (const run of evidence.sustainedRuns) {
    assertHash(run.captureArtifactHash, `Sustained run ${run.id}`);
    const startedAt = Date.parse(run.startedAt);
    const endedAt = Date.parse(run.endedAt);
    if (!run.id.trim() || !Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
      throw new Error("Sustained runs require an identity and valid time span.");
    }
    assertFiniteNonNegative(
      [
        run.cameraPreviewBaselineMiB,
        ...run.checkpoints.flatMap((checkpoint) => [
          checkpoint.atMs,
          checkpoint.previewFps,
          checkpoint.recognitionDurationMs,
          checkpoint.memoryMiB,
          checkpoint.batteryDrainPercentagePoints,
          checkpoint.crashes,
          checkpoint.reloads,
          checkpoint.thermalWarnings,
          checkpoint.cameraInterruptions,
          checkpoint.forcedRecoveries
        ])
      ],
      `Sustained run ${run.id}`
    );
    for (const checkpoint of run.checkpoints) {
      if (
        ![
          checkpoint.crashes,
          checkpoint.reloads,
          checkpoint.thermalWarnings,
          checkpoint.cameraInterruptions,
          checkpoint.forcedRecoveries
        ].every(Number.isSafeInteger)
      ) {
        throw new Error(`Sustained run ${run.id} event counts must be integers.`);
      }
    }
  }
}

function metadataMatches(
  manifest: QualificationManifest,
  evidence: PerformanceQualificationEvidence
) {
  return (
    configurationMatches(evidence.configuration, manifest.configuration) &&
    evidence.device.model === manifest.device.model &&
    evidence.device.osName === manifest.device.osName &&
    evidence.device.osVersion === manifest.device.osVersion &&
    evidence.device.releaseStatus === manifest.device.releaseStatus &&
    evidence.browser.name === manifest.browser.name &&
    evidence.browser.version === manifest.browser.version &&
    evidence.browser.releaseStatus === manifest.browser.releaseStatus
  );
}

export function createPerformanceQualificationEvidence(
  manifest: QualificationManifest,
  input: PerformanceQualificationEvidence
): PerformanceQualificationEvidence {
  validateQualificationManifest(manifest);
  if (
    input.version !== "qualification-performance-evidence.v1" ||
    !["physical-device", "simulation"].includes(input.evidenceKind)
  ) {
    throw new Error("Unknown qualification performance evidence schema.");
  }
  if (!metadataMatches(manifest, input)) {
    throw new Error(
      "Performance evidence configuration, device and browser must match the qualification block."
    );
  }
  assertEvidenceValues(input);
  return deepFreeze(structuredClone(input));
}

function cohortReport(
  samples: readonly StartupPerformanceMeasurement[]
): StartupCohortReport {
  return {
    sampleCount: samples.length,
    requiredSampleCount:
      QUALIFICATION_PERFORMANCE_POLICY.requiredStartsPerCacheState,
    appShellAndManualEntryInteractiveP95Ms: percentile(
      samples.map(({ appShellAndManualEntryInteractiveMs }) =>
        appShellAndManualEntryInteractiveMs
      ),
      0.95
    ),
    previewAfterPermissionP95Ms: percentile(
      samples.map(({ previewAfterPermissionMs }) => previewAfterPermissionMs),
      0.95
    ),
    recognitionReadyP95Ms: percentile(
      samples.map(({ recognitionReadyMs }) => recognitionReadyMs),
      0.95
    )
  };
}

function startupChecks(
  cacheState: "uncached" | "cached",
  cohort: StartupCohortReport,
  uniqueIds: boolean
) {
  const policy = QUALIFICATION_PERFORMANCE_POLICY;
  return [
    gate(
      `startup.${cacheState}.sample-count`,
      `${cacheState} start count`,
      cohort.sampleCount,
      policy.requiredStartsPerCacheState,
      "equal",
      "starts",
      uniqueIds && cohort.sampleCount === policy.requiredStartsPerCacheState
    ),
    gate(
      `startup.${cacheState}.app-shell-and-manual-entry-p95`,
      `${cacheState} App shell and Manual Price Entry interactive p95`,
      cohort.appShellAndManualEntryInteractiveP95Ms,
      policy.readiness.appShellAndManualEntryInteractiveP95Ms,
      "at-most",
      "ms"
    ),
    gate(
      `startup.${cacheState}.preview-p95`,
      `${cacheState} preview after permission p95`,
      cohort.previewAfterPermissionP95Ms,
      policy.readiness.previewAfterPermissionP95Ms,
      "at-most",
      "ms"
    ),
    gate(
      `startup.${cacheState}.recognition-ready-p95`,
      `${cacheState} recognition ready p95`,
      cohort.recognitionReadyP95Ms,
      cacheState === "uncached"
        ? policy.readiness.uncachedRecognitionReadyP95Ms
        : policy.readiness.cachedRecognitionReadyP95Ms,
      "at-most",
      "ms"
    )
  ];
}

function sceneMeasurementSignature(trial: ScenePerformanceTrial) {
  return JSON.stringify({
    guidePassDurationsMs: trial.guidePassDurationsMs,
    discoveryPassDurationsMs: trial.discoveryPassDurationsMs,
    searchingOrStabilizingGuideIntervalsMs:
      trial.searchingOrStabilizingGuideIntervalsMs,
    searchingOrStabilizingDiscoveryIntervalsMs:
      trial.searchingOrStabilizingDiscoveryIntervalsMs,
    yieldsBetweenPassesMs: trial.yieldsBetweenPassesMs,
    focusOutcome: trial.focusOutcome,
    focusedPriceLatencyMs: trial.focusedPriceLatencyMs,
    focusedGuideIntervalsMs: trial.focusedGuideIntervalsMs,
    focusedDiscoveryIntervalsMs: trial.focusedDiscoveryIntervalsMs
  });
}

function sceneTrialComplete(trial: ScenePerformanceTrial) {
  const hasCoreMeasurements =
    trial.guidePassDurationsMs.length > 0 &&
    trial.discoveryPassDurationsMs.length > 0 &&
    trial.searchingOrStabilizingGuideIntervalsMs.length > 0 &&
    trial.searchingOrStabilizingDiscoveryIntervalsMs.length > 0 &&
    trial.yieldsBetweenPassesMs.length > 0;
  const focusConsistent =
    trial.focusOutcome === "focused"
      ? trial.focusedPriceLatencyMs !== null &&
        trial.focusedGuideIntervalsMs.length > 0 &&
        trial.focusedDiscoveryIntervalsMs.length > 0
      : trial.focusedPriceLatencyMs === null &&
        trial.focusedGuideIntervalsMs.length === 0 &&
        trial.focusedDiscoveryIntervalsMs.length === 0;
  return hasCoreMeasurements && focusConsistent;
}

function runTelemetrySignature(run: SustainedPerformanceRun) {
  return JSON.stringify({
    cameraPreviewBaselineMiB: run.cameraPreviewBaselineMiB,
    checkpoints: [...run.checkpoints]
      .sort((left, right) => left.atMs - right.atMs)
      .map((checkpoint) => [
        checkpoint.atMs,
        checkpoint.previewFps,
        checkpoint.recognitionDurationMs,
        checkpoint.memoryMiB,
        checkpoint.batteryDrainPercentagePoints,
        checkpoint.crashes,
        checkpoint.reloads,
        checkpoint.thermalWarnings,
        checkpoint.cameraInterruptions,
        checkpoint.forcedRecoveries
      ])
  });
}

function sustainedRunReport(
  run: SustainedPerformanceRun,
  index: number
): SustainedRunReport {
  const policy = QUALIFICATION_PERFORMANCE_POLICY;
  const durationMs = Date.parse(run.endedAt) - Date.parse(run.startedAt);
  const sorted = [...run.checkpoints].sort((left, right) => left.atMs - right.atMs);
  const early = sorted.filter(({ atMs }) => atMs >= 120_000 && atMs <= 240_000);
  const late = sorted.filter(
    ({ atMs }) => atMs >= durationMs - 120_000 && atMs <= durationMs
  );
  const earlyP95 = percentile(early.map(({ recognitionDurationMs }) => recognitionDurationMs), 0.95);
  const lateP95 = percentile(late.map(({ recognitionDurationMs }) => recognitionDurationMs), 0.95);
  const slowdown =
    earlyP95 === null || lateP95 === null || earlyP95 === 0
      ? null
      : ((lateP95 - earlyP95) / earlyP95) * 100;
  const lastCheckpoint = sorted.at(-1);
  const batteryPerHour =
    !lastCheckpoint || durationMs <= 0
      ? null
      : lastCheckpoint.batteryDrainPercentagePoints * (3_600_000 / durationMs);
  const peakMemory = maximum(sorted.map(({ memoryMiB }) => memoryMiB));
  const additionalPeakMemory =
    peakMemory === null ? null : peakMemory - run.cameraPreviewBaselineMiB;
  const minute2Memory = sorted.find(({ atMs }) => atMs === 120_000)?.memoryMiB;
  const minute10Memory = sorted.find(({ atMs }) => atMs === 600_000)?.memoryMiB;
  const memoryGrowth =
    minute2Memory === undefined || minute10Memory === undefined
      ? null
      : minute10Memory - minute2Memory;
  const requiredTimes = Array.from(
    { length: policy.sustained.requiredCheckpointCount },
    (_, checkpointIndex) => checkpointIndex * policy.sustained.checkpointIntervalMs
  );
  const uniqueTimes = new Set(sorted.map(({ atMs }) => atMs));
  const gaps = sorted.slice(1).map((checkpoint, checkpointIndex) =>
    checkpoint.atMs - sorted[checkpointIndex].atMs
  );
  const batteryMonotonic = sorted.every(
    (checkpoint, checkpointIndex) =>
      checkpointIndex === 0 ||
      checkpoint.batteryDrainPercentagePoints >=
        sorted[checkpointIndex - 1].batteryDrainPercentagePoints
  );
  const checkpointCoverage =
    sorted.length >= policy.sustained.requiredCheckpointCount &&
    uniqueTimes.size === sorted.length &&
    sorted[0]?.atMs === 0 &&
    sorted.at(-1)?.atMs === durationMs &&
    gaps.every((gap) => gap <= policy.sustained.checkpointIntervalMs) &&
    requiredTimes.every((atMs) => uniqueTimes.has(atMs)) &&
    batteryMonotonic;
  const eventTotals = {
    crashes: sorted.reduce((total, checkpoint) => total + checkpoint.crashes, 0),
    reloads: sorted.reduce((total, checkpoint) => total + checkpoint.reloads, 0),
    thermalWarnings: sorted.reduce(
      (total, checkpoint) => total + checkpoint.thermalWarnings,
      0
    ),
    cameraInterruptions: sorted.reduce(
      (total, checkpoint) => total + checkpoint.cameraInterruptions,
      0
    ),
    forcedRecoveries: sorted.reduce(
      (total, checkpoint) => total + checkpoint.forcedRecoveries,
      0
    )
  };
  const prefix = `sustained.${index + 1}`;
  const checks = [
    gate(`${prefix}.duration`, "Sustained run duration", durationMs, policy.sustained.durationMs, "at-least", "ms"),
    gate(
      `${prefix}.checkpoint-coverage`,
      "Minute-by-minute checkpoint coverage",
      sorted.length,
      policy.sustained.requiredCheckpointCount,
      "at-least",
      "checkpoints",
      checkpointCoverage
    ),
    gate(
      `${prefix}.early-window-samples`,
      "Minutes 2–4 samples",
      early.length,
      policy.sustained.minimumWindowSamples,
      "at-least",
      "samples",
      early.length >= policy.sustained.minimumWindowSamples
    ),
    gate(
      `${prefix}.late-window-samples`,
      "Final-two-minute samples",
      late.length,
      policy.sustained.minimumWindowSamples,
      "at-least",
      "samples",
      late.length >= policy.sustained.minimumWindowSamples
    ),
    gate(`${prefix}.crashes`, "Crashes", eventTotals.crashes, 0, "equal", "events"),
    gate(`${prefix}.reloads`, "Reloads", eventTotals.reloads, 0, "equal", "events"),
    gate(`${prefix}.thermal-warnings`, "OS thermal warnings", eventTotals.thermalWarnings, 0, "equal", "events"),
    gate(
      `${prefix}.camera-interruptions`,
      "Camera interruptions",
      eventTotals.cameraInterruptions,
      0,
      "equal",
      "events"
    ),
    gate(`${prefix}.forced-recoveries`, "Forced recoveries", eventTotals.forcedRecoveries, 0, "equal", "events"),
    gate(
      `${prefix}.preview-fps`,
      "Minimum preview frame rate",
      minimum(sorted.map(({ previewFps }) => previewFps)),
      policy.sustained.minimumPreviewFps,
      "at-least",
      "fps"
    ),
    gate(
      `${prefix}.late-run-slowdown`,
      "Final-two-minute p95 slowdown",
      slowdown,
      policy.sustained.maximumLateRunSlowdownPercent,
      "at-most",
      "%"
    ),
    gate(
      `${prefix}.battery-drain`,
      "Extrapolated battery drain",
      batteryPerHour,
      policy.sustained.maximumBatteryDrainPercentagePointsPerHour,
      "at-most",
      "percentage points/hour"
    ),
    gate(
      `${prefix}.additional-peak-memory`,
      "Peak memory above preview baseline",
      additionalPeakMemory,
      policy.resources.additionalPeakMemoryMiB,
      "at-most",
      "MiB"
    ),
    gate(
      `${prefix}.memory-growth`,
      "Memory growth from minute 2 to minute 10",
      memoryGrowth,
      policy.resources.minute2To10MemoryGrowthMiB,
      "at-most",
      "MiB"
    )
  ];
  return {
    id: run.id,
    captureArtifactHash: run.captureArtifactHash,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    durationMs,
    checkpointCount: run.checkpoints.length,
    minimumPreviewFps: minimum(sorted.map(({ previewFps }) => previewFps)),
    minutes2To4RecognitionP95Ms: earlyP95,
    finalTwoMinutesRecognitionP95Ms: lateP95,
    lateRunSlowdownPercent: slowdown,
    batteryDrainPercentagePointsPerHour: batteryPerHour,
    additionalPeakMemoryMiB: additionalPeakMemory,
    minute2To10MemoryGrowthMiB: memoryGrowth,
    passed: checks.every(({ passed }) => passed),
    checks
  };
}

function missingReport(manifest: QualificationManifest): PerformanceQualificationReport {
  const missing = gate(
    "evidence.performance",
    "Performance evidence",
    null,
    1,
    "equal",
    "evidence block",
    false
  );
  return deepFreeze({
    version: "qualification-performance-report.v1",
    evidenceKind: "missing",
    configuration: structuredClone(manifest.configuration),
    device: structuredClone(manifest.device),
    browser: structuredClone(manifest.browser),
    evidenceComplete: false,
    meetsAllBudgets: false,
    performanceEligible: false,
    manualPriceEntryAvailable: true,
    disposition:
      "Performance measurements are missing; camera profile is ineligible on this platform and Manual Price Entry remains available.",
    startup: {
      network: {
        downMbps: null,
        roundTripMs: null,
        requiredDownMbps: QUALIFICATION_PERFORMANCE_POLICY.network.downMbps,
        requiredRoundTripMs: QUALIFICATION_PERFORMANCE_POLICY.network.roundTripMs
      },
      uncached: cohortReport([]),
      cached: cohortReport([])
    },
    sceneRun: {
      sceneCount: 0,
      requiredSceneCount: QUALIFICATION_PERFORMANCE_POLICY.requiredScenes,
      completeTrialCount: 0,
      uniqueMeasurementCount: 0,
      focusedPositiveTrialCount: 0,
      guidePassSampleCount: 0,
      discoveryPassSampleCount: 0,
      focusedPriceSampleCount: 0,
      guidePassP95Ms: null,
      discoveryPassP95Ms: null,
      focusedPriceP95Ms: null,
      searchingOrStabilizingGuideMaxIntervalMs: null,
      searchingOrStabilizingDiscoveryMaxIntervalMs: null,
      focusedGuideMaxIntervalMs: null,
      focusedDiscoveryMaxIntervalMs: null,
      minimumYieldMs: null
    },
    resources: {
      firstInstallTransferMiB: null,
      cachedProfileStorageMiB: null,
      additionalPeakMemoryMiB: null,
      minute2To10MemoryGrowthMiB: null
    },
    sustainedRuns: [],
    checks: [missing],
    failures: [missing]
  });
}

export function scorePerformanceQualification(
  manifest: QualificationManifest,
  evidence: PerformanceQualificationEvidence | null = null
): PerformanceQualificationReport {
  validateQualificationManifest(manifest);
  if (evidence === null) return missingReport(manifest);
  evidence = createPerformanceQualificationEvidence(manifest, evidence);

  const policy = QUALIFICATION_PERFORMANCE_POLICY;
  const uncached = cohortReport(evidence.starts.uncached);
  const cached = cohortReport(evidence.starts.cached);
  const trials = evidence.sceneRun.trials;
  const fixtureById = new Map(manifest.fixtures.map((fixture) => [fixture.id, fixture]));
  const completeTrialCount = trials.filter(sceneTrialComplete).length;
  const uniqueMeasurementCount = new Set(trials.map(sceneMeasurementSignature)).size;
  const positiveFocusedTrials = trials.filter((trial) => {
    const fixture = fixtureById.get(trial.fixtureId);
    return fixture && isPositiveStratum(fixture.stratum) && trial.focusOutcome === "focused";
  });
  const guidePassDurations = trials.flatMap(({ guidePassDurationsMs }) => guidePassDurationsMs);
  const discoveryPassDurations = trials.flatMap(({ discoveryPassDurationsMs }) => discoveryPassDurationsMs);
  const focusedPriceLatencies = positiveFocusedTrials.flatMap(
    ({ focusedPriceLatencyMs }) => focusedPriceLatencyMs === null ? [] : [focusedPriceLatencyMs]
  );
  const searchingGuideIntervals = trials.flatMap(
    ({ searchingOrStabilizingGuideIntervalsMs }) => searchingOrStabilizingGuideIntervalsMs
  );
  const searchingDiscoveryIntervals = trials.flatMap(
    ({ searchingOrStabilizingDiscoveryIntervalsMs }) => searchingOrStabilizingDiscoveryIntervalsMs
  );
  const focusedGuideIntervals = trials.flatMap(({ focusedGuideIntervalsMs }) => focusedGuideIntervalsMs);
  const focusedDiscoveryIntervals = trials.flatMap(
    ({ focusedDiscoveryIntervalsMs }) => focusedDiscoveryIntervalsMs
  );
  const yields = trials.flatMap(({ yieldsBetweenPassesMs }) => yieldsBetweenPassesMs);
  const scene = {
    sceneCount: trials.length,
    requiredSceneCount: policy.requiredScenes,
    completeTrialCount,
    uniqueMeasurementCount,
    focusedPositiveTrialCount: positiveFocusedTrials.length,
    guidePassSampleCount: guidePassDurations.length,
    discoveryPassSampleCount: discoveryPassDurations.length,
    focusedPriceSampleCount: focusedPriceLatencies.length,
    guidePassP95Ms: percentile(guidePassDurations, 0.95),
    discoveryPassP95Ms: percentile(discoveryPassDurations, 0.95),
    focusedPriceP95Ms: percentile(focusedPriceLatencies, 0.95),
    searchingOrStabilizingGuideMaxIntervalMs: maximum(searchingGuideIntervals),
    searchingOrStabilizingDiscoveryMaxIntervalMs: maximum(searchingDiscoveryIntervals),
    focusedGuideMaxIntervalMs: maximum(focusedGuideIntervals),
    focusedDiscoveryMaxIntervalMs: maximum(focusedDiscoveryIntervals),
    minimumYieldMs: minimum(yields)
  };
  const exactFixtureCoverage =
    trials.length === manifest.fixtures.length &&
    new Set(trials.map(({ fixtureId }) => fixtureId)).size === manifest.fixtures.length &&
    manifest.fixtures.every(({ id }) => trials.some(({ fixtureId }) => fixtureId === id));
  const uniqueSceneEvidence =
    new Set(trials.map(({ trialId }) => trialId)).size === trials.length &&
    new Set(trials.map(({ captureArtifactHash }) => captureArtifactHash)).size === trials.length &&
    new Set(trials.map(({ capturedAt }) => capturedAt)).size === trials.length &&
    uniqueMeasurementCount === trials.length;
  const sustainedRuns = evidence.sustainedRuns.map(sustainedRunReport);
  const sortedRunTimes = [...evidence.sustainedRuns].sort(
    (left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt)
  );
  const runsDoNotOverlap = sortedRunTimes.every(
    (run, index) => index === 0 || Date.parse(sortedRunTimes[index - 1].endedAt) <= Date.parse(run.startedAt)
  );
  const independentSustainedRuns =
    evidence.sustainedRuns.length === policy.requiredSustainedRuns &&
    new Set(evidence.sustainedRuns.map(({ id }) => id)).size === evidence.sustainedRuns.length &&
    new Set(
      evidence.sustainedRuns.map(
        ({ captureArtifactHash }) => captureArtifactHash
      )
    ).size === evidence.sustainedRuns.length &&
    new Set(evidence.sustainedRuns.map(runTelemetrySignature)).size === evidence.sustainedRuns.length &&
    runsDoNotOverlap;
  const resourceSummary = {
    firstInstallTransferMiB: evidence.resources.firstInstallTransferMiB,
    cachedProfileStorageMiB: evidence.resources.cachedProfileStorageMiB,
    additionalPeakMemoryMiB: maximum(
      sustainedRuns.flatMap(({ additionalPeakMemoryMiB }) =>
        additionalPeakMemoryMiB === null ? [] : [additionalPeakMemoryMiB]
      )
    ),
    minute2To10MemoryGrowthMiB: maximum(
      sustainedRuns.flatMap(({ minute2To10MemoryGrowthMiB }) =>
        minute2To10MemoryGrowthMiB === null ? [] : [minute2To10MemoryGrowthMiB]
      )
    )
  };
  const checks: PerformanceGateResult[] = [
    gate(
      "network.down",
      "Network download profile",
      evidence.network.downMbps,
      policy.network.downMbps,
      "equal",
      "Mbps"
    ),
    gate(
      "network.rtt",
      "Network round-trip profile",
      evidence.network.roundTripMs,
      policy.network.roundTripMs,
      "equal",
      "ms"
    ),
    ...startupChecks(
      "uncached",
      uncached,
      new Set(evidence.starts.uncached.map(({ id }) => id)).size ===
        evidence.starts.uncached.length
    ),
    ...startupChecks(
      "cached",
      cached,
      new Set(evidence.starts.cached.map(({ id }) => id)).size ===
        evidence.starts.cached.length
    ),
    gate(
      "scene.count",
      "Qualification scene count",
      scene.sceneCount,
      policy.requiredScenes,
      "equal",
      "trials",
      exactFixtureCoverage
    ),
    gate(
      "scene.complete-trial-count",
      "Complete per-fixture performance trials",
      completeTrialCount,
      policy.requiredScenes,
      "equal",
      "trials",
      completeTrialCount === policy.requiredScenes
    ),
    gate(
      "scene.unique-evidence-count",
      "Unique per-fixture measurement evidence",
      uniqueMeasurementCount,
      policy.requiredScenes,
      "equal",
      "trials",
      uniqueSceneEvidence
    ),
    gate(
      "scene.focused-positive-count",
      "Focused positive performance trials",
      positiveFocusedTrials.length,
      policy.requiredFocusedPositiveTrials,
      "at-least",
      "trials",
      positiveFocusedTrials.length >= policy.requiredFocusedPositiveTrials
    ),
    gate(
      "scene.guide-pass-duration-p95",
      "Capture Guide pass duration p95",
      scene.guidePassP95Ms,
      policy.sceneRun.guidePassP95Ms,
      "at-most",
      "ms"
    ),
    gate(
      "scene.discovery-pass-duration-p95",
      "Discovery pass duration p95",
      scene.discoveryPassP95Ms,
      policy.sceneRun.discoveryPassP95Ms,
      "at-most",
      "ms"
    ),
    gate(
      "scene.focused-price-p95",
      "Stable Focused Price p95",
      scene.focusedPriceP95Ms,
      policy.sceneRun.focusedPriceP95Ms,
      "at-most",
      "ms"
    ),
    gate(
      "scene.searching-guide-interval",
      "Searching/Stabilizing Guide interval",
      scene.searchingOrStabilizingGuideMaxIntervalMs,
      policy.sceneRun.searchingOrStabilizingGuideMaxIntervalMs,
      "at-most",
      "ms"
    ),
    gate(
      "scene.searching-discovery-interval",
      "Searching/Stabilizing discovery interval",
      scene.searchingOrStabilizingDiscoveryMaxIntervalMs,
      policy.sceneRun.searchingOrStabilizingDiscoveryMaxIntervalMs,
      "at-most",
      "ms"
    ),
    gate(
      "scene.focused-guide-interval",
      "Focused Guide interval",
      scene.focusedGuideMaxIntervalMs,
      policy.sceneRun.focusedGuideMaxIntervalMs,
      "at-most",
      "ms"
    ),
    gate(
      "scene.focused-discovery-interval",
      "Focused discovery interval",
      scene.focusedDiscoveryMaxIntervalMs,
      policy.sceneRun.focusedDiscoveryMaxIntervalMs,
      "at-most",
      "ms"
    ),
    gate(
      "scene.minimum-yield",
      "Yield between passes",
      scene.minimumYieldMs,
      policy.sceneRun.minimumYieldMs,
      "at-least",
      "ms"
    ),
    gate(
      "resources.first-install-transfer",
      "First-install recognition transfer",
      resourceSummary.firstInstallTransferMiB,
      policy.resources.firstInstallTransferMiB,
      "at-most",
      "MiB"
    ),
    gate(
      "resources.cached-profile-storage",
      "Cached profile storage",
      resourceSummary.cachedProfileStorageMiB,
      policy.resources.cachedProfileStorageMiB,
      "at-most",
      "MiB"
    ),
    gate(
      "sustained.run-count",
      "Independent ten-minute sustained runs",
      evidence.sustainedRuns.length,
      policy.requiredSustainedRuns,
      "equal",
      "runs",
      independentSustainedRuns
    ),
    ...sustainedRuns.flatMap(({ checks: runChecks }) => runChecks)
  ];
  const failures = checks.filter(({ passed }) => !passed);
  const evidenceComplete = checks.every(({ measurementPresent }) => measurementPresent);
  const meetsAllBudgets = failures.length === 0;
  const performanceEligible =
    evidence.evidenceKind === "physical-device" && evidenceComplete && meetsAllBudgets;
  const disposition = performanceEligible
    ? "Physical-device performance gate passes; reliability and safety evidence must also pass independently."
    : evidence.evidenceKind === "simulation" && meetsAllBudgets
      ? "Simulation meets the budget contract but is not physical evidence; camera profile remains ineligible and Manual Price Entry remains available."
      : "Camera profile is ineligible on this platform; Manual Price Entry remains available.";
  return deepFreeze({
    version: "qualification-performance-report.v1",
    evidenceKind: evidence.evidenceKind,
    configuration: structuredClone(manifest.configuration),
    device: structuredClone(manifest.device),
    browser: structuredClone(manifest.browser),
    evidenceComplete,
    meetsAllBudgets,
    performanceEligible,
    manualPriceEntryAvailable: true,
    disposition,
    startup: {
      network: {
        downMbps: evidence.network.downMbps,
        roundTripMs: evidence.network.roundTripMs,
        requiredDownMbps: policy.network.downMbps,
        requiredRoundTripMs: policy.network.roundTripMs
      },
      uncached,
      cached
    },
    sceneRun: scene,
    resources: resourceSummary,
    sustainedRuns,
    checks,
    failures
  });
}
