import { deepFreeze } from "../domain/exactObject";
import {
  configurationMatches,
  validateQualificationManifest
} from "./qualificationManifest";
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
  requiredSceneMetricSamples: 299,
  requiredFocusedMetricSamples: 108,
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
    minimumPreviewFps: 24,
    maximumLateRunSlowdownPercent: 25,
    maximumBatteryDrainPercentagePointsPerHour: 20
  }
} as const;

export type PerformanceEvidenceKind = "physical-device" | "simulation";

export interface StartupPerformanceMeasurement {
  readonly id: string;
  readonly appShellAndManualEntryInteractiveMs: number;
  readonly previewAfterPermissionMs: number;
  readonly recognitionReadyMs: number;
}

export interface SustainedPerformanceRun {
  readonly id: string;
  readonly durationMs: number;
  readonly crashes: number;
  readonly reloads: number;
  readonly thermalWarnings: number;
  readonly cameraInterruptions: number;
  readonly forcedRecoveries: number;
  readonly previewFpsSamples: readonly number[];
  readonly minutes2To4RecognitionDurationsMs: readonly number[];
  readonly finalTwoMinutesRecognitionDurationsMs: readonly number[];
  readonly batteryDrainPercentagePoints: number;
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
    readonly fixtureIds: readonly string[];
    readonly guidePassDurationsMs: readonly number[];
    readonly discoveryPassDurationsMs: readonly number[];
    readonly focusedPriceLatenciesMs: readonly number[];
    readonly searchingOrStabilizingGuideIntervalsMs: readonly number[];
    readonly searchingOrStabilizingDiscoveryIntervalsMs: readonly number[];
    readonly focusedGuideIntervalsMs: readonly number[];
    readonly focusedDiscoveryIntervalsMs: readonly number[];
    readonly yieldsBetweenPassesMs: readonly number[];
  };
  readonly resources: {
    readonly firstInstallTransferMiB: number;
    readonly cachedProfileStorageMiB: number;
    readonly cameraPreviewBaselineMiB: number;
    readonly peakWithRecognitionMiB: number;
    readonly minute2MemoryMiB: number;
    readonly minute10MemoryMiB: number;
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
  readonly durationMs: number;
  readonly minimumPreviewFps: number | null;
  readonly minutes2To4RecognitionP95Ms: number | null;
  readonly finalTwoMinutesRecognitionP95Ms: number | null;
  readonly lateRunSlowdownPercent: number | null;
  readonly batteryDrainPercentagePointsPerHour: number | null;
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
    readonly sampleCounts: {
      readonly guidePassDurations: number;
      readonly discoveryPassDurations: number;
      readonly focusedPriceLatencies: number;
      readonly searchingOrStabilizingGuideIntervals: number;
      readonly searchingOrStabilizingDiscoveryIntervals: number;
      readonly focusedGuideIntervals: number;
      readonly focusedDiscoveryIntervals: number;
      readonly yieldsBetweenPasses: number;
    };
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

function percentile(
  values: readonly number[],
  probability: number
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(probability * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function maximum(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.max(...values);
}

function minimum(values: readonly number[]): number | null {
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

function assertFiniteNonNegative(
  values: readonly number[],
  description: string
) {
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(
      `${description} must contain finite, non-negative measurements.`
    );
  }
}

function assertEvidenceValues(evidence: PerformanceQualificationEvidence) {
  const scalarValues = [
    evidence.network.downMbps,
    evidence.network.roundTripMs,
    ...Object.values(evidence.resources)
  ];
  assertFiniteNonNegative(scalarValues, "Performance evidence");
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
  for (const values of Object.values(evidence.sceneRun)) {
    if (values === evidence.sceneRun.fixtureIds) continue;
    assertFiniteNonNegative(values as readonly number[], "Scene-run evidence");
  }
  for (const run of evidence.sustainedRuns) {
    assertFiniteNonNegative(
      [
        run.durationMs,
        run.crashes,
        run.reloads,
        run.thermalWarnings,
        run.cameraInterruptions,
        run.forcedRecoveries,
        run.batteryDrainPercentagePoints,
        ...run.previewFpsSamples,
        ...run.minutes2To4RecognitionDurationsMs,
        ...run.finalTwoMinutesRecognitionDurationsMs
      ],
      `Sustained run ${run.id}`
    );
    if (
      ![
        run.crashes,
        run.reloads,
        run.thermalWarnings,
        run.cameraInterruptions,
        run.forcedRecoveries
      ].every(Number.isSafeInteger)
    ) {
      throw new Error(`Sustained run ${run.id} event counts must be integers.`);
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
): readonly PerformanceGateResult[] {
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

function sustainedRunReport(
  run: SustainedPerformanceRun,
  index: number
): SustainedRunReport {
  const earlyP95 = percentile(run.minutes2To4RecognitionDurationsMs, 0.95);
  const lateP95 = percentile(run.finalTwoMinutesRecognitionDurationsMs, 0.95);
  const slowdown =
    earlyP95 === null || lateP95 === null || earlyP95 === 0
      ? null
      : ((lateP95 - earlyP95) / earlyP95) * 100;
  const batteryPerHour =
    run.durationMs === 0
      ? null
      : run.batteryDrainPercentagePoints * (3_600_000 / run.durationMs);
  const prefix = `sustained.${index + 1}`;
  const policy = QUALIFICATION_PERFORMANCE_POLICY.sustained;
  const checks = [
    gate(
      `${prefix}.duration`,
      "Sustained run duration",
      run.durationMs,
      policy.durationMs,
      "at-least",
      "ms"
    ),
    gate(`${prefix}.crashes`, "Crashes", run.crashes, 0, "equal", "events"),
    gate(`${prefix}.reloads`, "Reloads", run.reloads, 0, "equal", "events"),
    gate(
      `${prefix}.thermal-warnings`,
      "OS thermal warnings",
      run.thermalWarnings,
      0,
      "equal",
      "events"
    ),
    gate(
      `${prefix}.camera-interruptions`,
      "Camera interruptions",
      run.cameraInterruptions,
      0,
      "equal",
      "events"
    ),
    gate(
      `${prefix}.forced-recoveries`,
      "Forced recoveries",
      run.forcedRecoveries,
      0,
      "equal",
      "events"
    ),
    gate(
      `${prefix}.preview-fps`,
      "Minimum preview frame rate",
      minimum(run.previewFpsSamples),
      policy.minimumPreviewFps,
      "at-least",
      "fps"
    ),
    gate(
      `${prefix}.late-run-slowdown`,
      "Final-two-minute p95 slowdown",
      slowdown,
      policy.maximumLateRunSlowdownPercent,
      "at-most",
      "%"
    ),
    gate(
      `${prefix}.battery-drain`,
      "Extrapolated battery drain",
      batteryPerHour,
      policy.maximumBatteryDrainPercentagePointsPerHour,
      "at-most",
      "percentage points/hour"
    )
  ];
  return {
    id: run.id,
    durationMs: run.durationMs,
    minimumPreviewFps: minimum(run.previewFpsSamples),
    minutes2To4RecognitionP95Ms: earlyP95,
    finalTwoMinutesRecognitionP95Ms: lateP95,
    lateRunSlowdownPercent: slowdown,
    batteryDrainPercentagePointsPerHour: batteryPerHour,
    passed: checks.every(({ passed }) => passed),
    checks
  };
}

export function scorePerformanceQualification(
  manifest: QualificationManifest,
  evidence: PerformanceQualificationEvidence | null = null
): PerformanceQualificationReport {
  validateQualificationManifest(manifest);
  if (evidence === null) {
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
          requiredRoundTripMs:
            QUALIFICATION_PERFORMANCE_POLICY.network.roundTripMs
        },
        uncached: cohortReport([]),
        cached: cohortReport([])
      },
      sceneRun: {
        sceneCount: 0,
        requiredSceneCount: QUALIFICATION_PERFORMANCE_POLICY.requiredScenes,
        sampleCounts: {
          guidePassDurations: 0,
          discoveryPassDurations: 0,
          focusedPriceLatencies: 0,
          searchingOrStabilizingGuideIntervals: 0,
          searchingOrStabilizingDiscoveryIntervals: 0,
          focusedGuideIntervals: 0,
          focusedDiscoveryIntervals: 0,
          yieldsBetweenPasses: 0
        },
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
  evidence = createPerformanceQualificationEvidence(manifest, evidence);

  const policy = QUALIFICATION_PERFORMANCE_POLICY;
  const uncached = cohortReport(evidence.starts.uncached);
  const cached = cohortReport(evidence.starts.cached);
  const scene = {
    sceneCount: evidence.sceneRun.fixtureIds.length,
    requiredSceneCount: policy.requiredScenes,
    sampleCounts: {
      guidePassDurations: evidence.sceneRun.guidePassDurationsMs.length,
      discoveryPassDurations:
        evidence.sceneRun.discoveryPassDurationsMs.length,
      focusedPriceLatencies:
        evidence.sceneRun.focusedPriceLatenciesMs.length,
      searchingOrStabilizingGuideIntervals:
        evidence.sceneRun.searchingOrStabilizingGuideIntervalsMs.length,
      searchingOrStabilizingDiscoveryIntervals:
        evidence.sceneRun.searchingOrStabilizingDiscoveryIntervalsMs.length,
      focusedGuideIntervals: evidence.sceneRun.focusedGuideIntervalsMs.length,
      focusedDiscoveryIntervals:
        evidence.sceneRun.focusedDiscoveryIntervalsMs.length,
      yieldsBetweenPasses: evidence.sceneRun.yieldsBetweenPassesMs.length
    },
    guidePassP95Ms: percentile(evidence.sceneRun.guidePassDurationsMs, 0.95),
    discoveryPassP95Ms: percentile(
      evidence.sceneRun.discoveryPassDurationsMs,
      0.95
    ),
    focusedPriceP95Ms: percentile(
      evidence.sceneRun.focusedPriceLatenciesMs,
      0.95
    ),
    searchingOrStabilizingGuideMaxIntervalMs: maximum(
      evidence.sceneRun.searchingOrStabilizingGuideIntervalsMs
    ),
    searchingOrStabilizingDiscoveryMaxIntervalMs: maximum(
      evidence.sceneRun.searchingOrStabilizingDiscoveryIntervalsMs
    ),
    focusedGuideMaxIntervalMs: maximum(
      evidence.sceneRun.focusedGuideIntervalsMs
    ),
    focusedDiscoveryMaxIntervalMs: maximum(
      evidence.sceneRun.focusedDiscoveryIntervalsMs
    ),
    minimumYieldMs: minimum(evidence.sceneRun.yieldsBetweenPassesMs)
  };
  const resources = {
    firstInstallTransferMiB: evidence.resources.firstInstallTransferMiB,
    cachedProfileStorageMiB: evidence.resources.cachedProfileStorageMiB,
    additionalPeakMemoryMiB:
      evidence.resources.peakWithRecognitionMiB -
      evidence.resources.cameraPreviewBaselineMiB,
    minute2To10MemoryGrowthMiB:
      evidence.resources.minute10MemoryMiB -
      evidence.resources.minute2MemoryMiB
  };
  const exactFixtureCoverage =
    evidence.sceneRun.fixtureIds.length === manifest.fixtures.length &&
    new Set(evidence.sceneRun.fixtureIds).size === manifest.fixtures.length &&
    manifest.fixtures.every(({ id }) => evidence.sceneRun.fixtureIds.includes(id));
  const sustainedRuns = evidence.sustainedRuns.map(sustainedRunReport);
  const checks: PerformanceGateResult[] = [
    gate("network.down", "Network download profile", evidence.network.downMbps, policy.network.downMbps, "equal", "Mbps"),
    gate("network.rtt", "Network round-trip profile", evidence.network.roundTripMs, policy.network.roundTripMs, "equal", "ms"),
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
    gate("scene.count", "Qualification scene count", scene.sceneCount, policy.requiredScenes, "equal", "scenes", exactFixtureCoverage),
    gate("scene.guide-pass-sample-count", "Capture Guide pass sample count", scene.sampleCounts.guidePassDurations, policy.requiredSceneMetricSamples, "at-least", "samples"),
    gate("scene.discovery-pass-sample-count", "Discovery pass sample count", scene.sampleCounts.discoveryPassDurations, policy.requiredSceneMetricSamples, "at-least", "samples"),
    gate("scene.focused-price-sample-count", "Stable Focused Price sample count", scene.sampleCounts.focusedPriceLatencies, policy.requiredFocusedMetricSamples, "at-least", "samples"),
    gate("scene.searching-guide-sample-count", "Searching/Stabilizing Guide interval sample count", scene.sampleCounts.searchingOrStabilizingGuideIntervals, policy.requiredSceneMetricSamples, "at-least", "samples"),
    gate("scene.searching-discovery-sample-count", "Searching/Stabilizing discovery interval sample count", scene.sampleCounts.searchingOrStabilizingDiscoveryIntervals, policy.requiredSceneMetricSamples, "at-least", "samples"),
    gate("scene.focused-guide-sample-count", "Focused Guide interval sample count", scene.sampleCounts.focusedGuideIntervals, policy.requiredFocusedMetricSamples, "at-least", "samples"),
    gate("scene.focused-discovery-sample-count", "Focused discovery interval sample count", scene.sampleCounts.focusedDiscoveryIntervals, policy.requiredFocusedMetricSamples, "at-least", "samples"),
    gate("scene.yield-sample-count", "Inter-pass yield sample count", scene.sampleCounts.yieldsBetweenPasses, policy.requiredSceneMetricSamples, "at-least", "samples"),
    gate("scene.guide-pass-duration-p95", "Capture Guide pass duration p95", scene.guidePassP95Ms, policy.sceneRun.guidePassP95Ms, "at-most", "ms"),
    gate("scene.discovery-pass-duration-p95", "Discovery pass duration p95", scene.discoveryPassP95Ms, policy.sceneRun.discoveryPassP95Ms, "at-most", "ms"),
    gate("scene.focused-price-p95", "Stable Focused Price p95", scene.focusedPriceP95Ms, policy.sceneRun.focusedPriceP95Ms, "at-most", "ms"),
    gate("scene.searching-guide-interval", "Searching/Stabilizing Guide interval", scene.searchingOrStabilizingGuideMaxIntervalMs, policy.sceneRun.searchingOrStabilizingGuideMaxIntervalMs, "at-most", "ms"),
    gate("scene.searching-discovery-interval", "Searching/Stabilizing discovery interval", scene.searchingOrStabilizingDiscoveryMaxIntervalMs, policy.sceneRun.searchingOrStabilizingDiscoveryMaxIntervalMs, "at-most", "ms"),
    gate("scene.focused-guide-interval", "Focused Guide interval", scene.focusedGuideMaxIntervalMs, policy.sceneRun.focusedGuideMaxIntervalMs, "at-most", "ms"),
    gate("scene.focused-discovery-interval", "Focused discovery interval", scene.focusedDiscoveryMaxIntervalMs, policy.sceneRun.focusedDiscoveryMaxIntervalMs, "at-most", "ms"),
    gate("scene.minimum-yield", "Yield between passes", scene.minimumYieldMs, policy.sceneRun.minimumYieldMs, "at-least", "ms"),
    gate("resources.first-install-transfer", "First-install recognition transfer", resources.firstInstallTransferMiB, policy.resources.firstInstallTransferMiB, "at-most", "MiB"),
    gate("resources.cached-profile-storage", "Cached profile storage", resources.cachedProfileStorageMiB, policy.resources.cachedProfileStorageMiB, "at-most", "MiB"),
    gate("resources.additional-peak-memory", "Peak memory above preview baseline", resources.additionalPeakMemoryMiB, policy.resources.additionalPeakMemoryMiB, "at-most", "MiB"),
    gate("resources.minute-2-to-10-memory-growth", "Memory growth from minute 2 to minute 10", resources.minute2To10MemoryGrowthMiB, policy.resources.minute2To10MemoryGrowthMiB, "at-most", "MiB"),
    gate(
      "sustained.run-count",
      "Separate ten-minute sustained run count",
      evidence.sustainedRuns.length,
      policy.requiredSustainedRuns,
      "equal",
      "runs",
      evidence.sustainedRuns.length === policy.requiredSustainedRuns &&
        new Set(evidence.sustainedRuns.map(({ id }) => id)).size ===
          evidence.sustainedRuns.length
    ),
    ...sustainedRuns.flatMap(({ checks: runChecks }) => runChecks)
  ];
  const failures = checks.filter(({ passed }) => !passed);
  const evidenceComplete = checks.every(({ measurementPresent }) => measurementPresent);
  const meetsAllBudgets = failures.length === 0;
  const performanceEligible =
    evidence.evidenceKind === "physical-device" &&
    evidenceComplete &&
    meetsAllBudgets;
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
    resources,
    sustainedRuns,
    checks,
    failures
  });
}
