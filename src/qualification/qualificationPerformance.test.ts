import { describe, expect, it } from "vitest";

import {
  createPerformanceQualificationEvidence,
  createFrozenTrialRecord,
  createQualificationManifest,
  scorePerformanceQualification,
  scoreProfileQualification,
  type FixtureManifestEntry,
  type PerformanceQualificationEvidence,
  type TrialCaptureInput
} from "./qualificationHarness";
import type {
  QualificationChallenge,
  QualificationManifest,
  QualificationStratum
} from "./qualificationTypes";

const configuration = {
  sourceCurrency: "JPY",
  platform: "ios",
  profileId: "jpy-ios-v1",
  profileVersion: "recognition-profile.v1",
  profileHash:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  evidenceVersion: "jpy-ios-evidence-v1",
  acceptedMarkerClasses: ["symbol"],
  acceptedNumberFormatClasses: ["standard"]
} as const;

const device = {
  model: "iPhone 16 Pro",
  osName: "iOS",
  osVersion: "19.0",
  releaseStatus: "current"
} as const;

const browser = {
  name: "Safari",
  version: "19.0",
  releaseStatus: "current"
} as const;

const challenges: readonly QualificationChallenge[] = [
  "physical-tag",
  "receipt",
  "menu",
  "vending-or-electronic-display",
  "sale-formatting",
  "lighting",
  "glare",
  "moire",
  "distance",
  "rotation",
  "occlusion",
  "multiple-prices",
  "discount-pair",
  "nearby-non-price-numerals"
];

function validManifest(): QualificationManifest {
  const strata: readonly [QualificationStratum, number][] = [
    ["clean-single-price", 40],
    ["difficult-single-price", 40],
    ["complex-selection", 40],
    ["non-price-numerals", 45],
    ["wrong-or-unsupported-currency", 45],
    ["malformed-or-ambiguous-fragment", 45],
    ["realistic-no-price-retail", 44]
  ];
  const fixtures: FixtureManifestEntry[] = strata.flatMap(([stratum, count]) =>
    Array.from({ length: count }, (_, index) => ({
      id: `${stratum}-${index}`,
      stratum,
      inventory: "held-out" as const,
      provenance: {
        kind: "consented" as const,
        reference: `consent:${stratum}-${index}`
      },
      markerClass: stratum.includes("single-price") || stratum === "complex-selection"
        ? "symbol"
        : null,
      numberFormatClass:
        stratum.includes("single-price") || stratum === "complex-selection"
          ? "standard"
          : null,
      challenges
    }))
  );
  return createQualificationManifest({
    version: "qualification-manifest.v1",
    configuration,
    device,
    browser,
    fixtures
  });
}

function passingEvidence(
  manifest: QualificationManifest,
  evidenceKind: PerformanceQualificationEvidence["evidenceKind"] =
    "physical-device"
): PerformanceQualificationEvidence {
  const starts = (recognitionReadyMs: number) =>
    Array.from({ length: 30 }, (_, index) => ({
      id: `start-${index}`,
      appShellAndManualEntryInteractiveMs: 2_500,
      previewAfterPermissionMs: 2_000,
      recognitionReadyMs
    }));
  const sustainedRun = (id: string) => ({
    id,
    durationMs: 600_000,
    crashes: 0,
    reloads: 0,
    thermalWarnings: 0,
    cameraInterruptions: 0,
    forcedRecoveries: 0,
    previewFpsSamples: [24],
    minutes2To4RecognitionDurationsMs: [1_000],
    finalTwoMinutesRecognitionDurationsMs: [1_250],
    batteryDrainPercentagePoints: 20 / 6
  });

  return {
    version: "qualification-performance-evidence.v1",
    evidenceKind,
    configuration,
    device,
    browser,
    network: { downMbps: 10, roundTripMs: 150 },
    starts: {
      uncached: starts(30_000),
      cached: starts(3_000)
    },
    sceneRun: {
      fixtureIds: manifest.fixtures.map(({ id }) => id),
      guidePassDurationsMs: Array(299).fill(1_000),
      discoveryPassDurationsMs: Array(299).fill(2_000),
      focusedPriceLatenciesMs: Array(108).fill(5_000),
      searchingOrStabilizingGuideIntervalsMs: Array(299).fill(1_500),
      searchingOrStabilizingDiscoveryIntervalsMs: Array(299).fill(4_000),
      focusedGuideIntervalsMs: Array(108).fill(2_000),
      focusedDiscoveryIntervalsMs: Array(108).fill(5_000),
      yieldsBetweenPassesMs: Array(299).fill(250)
    },
    resources: {
      firstInstallTransferMiB: 60,
      cachedProfileStorageMiB: 75,
      cameraPreviewBaselineMiB: 100,
      peakWithRecognitionMiB: 400,
      minute2MemoryMiB: 200,
      minute10MemoryMiB: 225
    },
    sustainedRuns: [
      sustainedRun("sustained-1"),
      sustainedRun("sustained-2"),
      sustainedRun("sustained-3")
    ]
  };
}

function passingReliabilityRecords(manifest: QualificationManifest) {
  const exactPrice = { sourceCurrency: "JPY", minorUnits: 12_345 } as const;
  return manifest.fixtures.map((entry) => {
    const positive = entry.markerClass !== null;
    const input: TrialCaptureInput = {
      fixtureId: entry.id,
      stratum: entry.stratum,
      configuration: manifest.configuration,
      device: manifest.device,
      browser: manifest.browser,
      timings: {
        recognitionReadyMs: 1_000,
        observationWindowMs: 10_000,
        geometryMs: positive ? 1_000 : null
      },
      expectation: positive ? exactPrice : null,
      focusTransitions: positive
        ? [{ atMs: 1_000, focusedPrice: exactPrice }]
        : [],
      geometry: positive ? { oneToOne: true, iou: 0.75 } : null,
      terminalOutcome: "completed"
    };
    return createFrozenTrialRecord(manifest, input);
  });
}

describe("mobile performance qualification", () => {
  it("passes physical evidence exactly at every hard boundary", () => {
    const manifest = validManifest();
    const report = scorePerformanceQualification(
      manifest,
      passingEvidence(manifest)
    );

    expect(report.evidenceComplete).toBe(true);
    expect(report.meetsAllBudgets).toBe(true);
    expect(report.performanceEligible).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.startup.uncached.sampleCount).toBe(30);
    expect(report.startup.cached.sampleCount).toBe(30);
    expect(report.sceneRun.sceneCount).toBe(299);
    expect(report.sceneRun.sampleCounts).toMatchObject({
      guidePassDurations: 299,
      discoveryPassDurations: 299,
      focusedPriceLatencies: 108,
      yieldsBetweenPasses: 299
    });
    expect(report.sustainedRuns).toHaveLength(3);
    expect(report.disposition).toMatch(/performance gate passes/i);
    expect(Object.isFrozen(report)).toBe(true);
  });

  it("calculates nearest-rank p95 instead of using the maximum", () => {
    const manifest = validManifest();
    const evidence = passingEvidence(manifest);
    const uncached = evidence.starts.uncached.map((sample, index) => ({
      ...sample,
      recognitionReadyMs: index < 1 ? 30_001 : 30_000
    }));
    const report = scorePerformanceQualification(manifest, {
      ...evidence,
      starts: { ...evidence.starts, uncached }
    });

    expect(report.startup.uncached.recognitionReadyP95Ms).toBe(30_000);
    expect(report.performanceEligible).toBe(true);

    const withTwoSlowStarts = uncached.map((sample, index) =>
      index === 1 ? { ...sample, recognitionReadyMs: 30_001 } : sample
    );
    const failed = scorePerformanceQualification(manifest, {
      ...evidence,
      starts: { ...evidence.starts, uncached: withTwoSlowStarts }
    });
    expect(failed.startup.uncached.recognitionReadyP95Ms).toBe(30_001);
    expect(failed.performanceEligible).toBe(false);
  });

  it.each([
    ["fixed network", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      network: { ...evidence.network, roundTripMs: 149 }
    })],
    ["30 uncached starts", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      starts: { ...evidence.starts, uncached: evidence.starts.uncached.slice(1) }
    })],
    ["App shell interactivity", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      starts: {
        ...evidence.starts,
        cached: evidence.starts.cached.map((sample) => ({
          ...sample,
          appShellAndManualEntryInteractiveMs: 2_501
        }))
      }
    })],
    ["preview readiness", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      starts: {
        ...evidence.starts,
        uncached: evidence.starts.uncached.map((sample) => ({
          ...sample,
          previewAfterPermissionMs: 2_001
        }))
      }
    })],
    ["cached recognition readiness", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      starts: {
        ...evidence.starts,
        cached: evidence.starts.cached.map((sample) => ({
          ...sample,
          recognitionReadyMs: 3_001
        }))
      }
    })],
    ["299 scenes", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: { ...evidence.sceneRun, fixtureIds: evidence.sceneRun.fixtureIds.slice(1) }
    })],
    ["Guide p95", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: { ...evidence.sceneRun, guidePassDurationsMs: [1_001] }
    })],
    ["discovery p95", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: { ...evidence.sceneRun, discoveryPassDurationsMs: [2_001] }
    })],
    ["Searching Guide cadence", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: {
        ...evidence.sceneRun,
        searchingOrStabilizingGuideIntervalsMs: [1_501]
      }
    })],
    ["Searching discovery cadence", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: {
        ...evidence.sceneRun,
        searchingOrStabilizingDiscoveryIntervalsMs: [4_001]
      }
    })],
    ["Focused Guide cadence", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: { ...evidence.sceneRun, focusedGuideIntervalsMs: [2_001] }
    })],
    ["Focused discovery cadence", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: { ...evidence.sceneRun, focusedDiscoveryIntervalsMs: [5_001] }
    })],
    ["yield", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: { ...evidence.sceneRun, yieldsBetweenPassesMs: [249] }
    })],
    ["Focused Price deadline", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: { ...evidence.sceneRun, focusedPriceLatenciesMs: [5_001] }
    })],
    ["asset transfer", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      resources: { ...evidence.resources, firstInstallTransferMiB: 60.01 }
    })],
    ["cached storage", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      resources: { ...evidence.resources, cachedProfileStorageMiB: 75.01 }
    })],
    ["peak memory above baseline", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      resources: { ...evidence.resources, peakWithRecognitionMiB: 400.01 }
    })],
    ["minute-2-to-10 memory growth", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      resources: { ...evidence.resources, minute10MemoryMiB: 225.01 }
    })],
    ["three sustained runs", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.slice(1)
    })],
    ["ten-minute run duration", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 0 ? { ...run, durationMs: 599_999 } : run
      )
    })],
    ["crash result", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 0 ? { ...run, crashes: 1 } : run
      )
    })],
    ["reload result", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 2 ? { ...run, reloads: 1 } : run
      )
    })],
    ["thermal warning result", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 0 ? { ...run, thermalWarnings: 1 } : run
      )
    })],
    ["camera interruption result", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 0 ? { ...run, cameraInterruptions: 1 } : run
      )
    })],
    ["forced recovery result", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 0 ? { ...run, forcedRecoveries: 1 } : run
      )
    })],
    ["preview frame rate", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 1 ? { ...run, previewFpsSamples: [23.99] } : run
      )
    })],
    ["late-run slowdown", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 1
          ? { ...run, finalTwoMinutesRecognitionDurationsMs: [1_251] }
          : run
      )
    })],
    ["battery drain", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 0 ? { ...run, batteryDrainPercentagePoints: 3.34 } : run
      )
    })]
  ])("does not let another metric compensate for a failed %s gate", (_name, change) => {
    const manifest = validManifest();
    const report = scorePerformanceQualification(
      manifest,
      change(passingEvidence(manifest))
    );

    expect(report.performanceEligible).toBe(false);
    expect(report.failures.length).toBeGreaterThan(0);
    expect(report.disposition).toMatch(/Manual Price Entry/i);
  });

  it("makes missing measurements ineligible without throwing away the report", () => {
    const manifest = validManifest();
    const evidence = passingEvidence(manifest);
    const report = scorePerformanceQualification(manifest, {
      ...evidence,
      sceneRun: { ...evidence.sceneRun, guidePassDurationsMs: [] }
    });

    expect(report.evidenceComplete).toBe(false);
    expect(report.performanceEligible).toBe(false);
    expect(report.failures).toContainEqual(
      expect.objectContaining({ id: "scene.guide-pass-duration-p95", actual: null })
    );
  });

  it("labels synthetic calculations and never treats them as physical evidence", () => {
    const manifest = validManifest();
    const report = scorePerformanceQualification(
      manifest,
      passingEvidence(manifest, "simulation")
    );

    expect(report.meetsAllBudgets).toBe(true);
    expect(report.performanceEligible).toBe(false);
    expect(report.evidenceKind).toBe("simulation");
    expect(report.disposition).toMatch(/simulation.*Manual Price Entry/i);
  });

  it("captures a frozen evidence block tied to one profile and platform", () => {
    const manifest = validManifest();
    const input = passingEvidence(manifest);
    const evidence = createPerformanceQualificationEvidence(manifest, input);

    expect(evidence).not.toBe(input);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.starts.uncached)).toBe(true);
    expect(() =>
      createPerformanceQualificationEvidence(manifest, {
        ...input,
        browser: { ...input.browser, version: "different" }
      })
    ).toThrow(/match the qualification block/i);
  });

  it("requires reliability and physical performance to pass independently", () => {
    const manifest = validManifest();
    const records = passingReliabilityRecords(manifest);
    const passed = scoreProfileQualification(
      manifest,
      records,
      passingEvidence(manifest)
    );

    expect(passed.reliability.qualified).toBe(true);
    expect(passed.performance.performanceEligible).toBe(true);
    expect(passed.qualified).toBe(true);

    const failedReliability = scoreProfileQualification(
      manifest,
      records.slice(1),
      passingEvidence(manifest)
    );
    expect(failedReliability.reliability.qualified).toBe(false);
    expect(failedReliability.performance.performanceEligible).toBe(true);
    expect(failedReliability.qualified).toBe(false);
  });
});
