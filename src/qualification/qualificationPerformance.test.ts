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
  const sha256 = (value: number) =>
    `sha256:${value.toString(16).padStart(64, "0")}` as const;
  const starts = (recognitionReadyMs: number) =>
    Array.from({ length: 30 }, (_, index) => ({
      id: `start-${index}`,
      appShellAndManualEntryInteractiveMs: 2_500,
      previewAfterPermissionMs: 2_000,
      recognitionReadyMs
    }));
  const sustainedRun = (index: number) => {
    const startedAtMs = Date.parse(`2026-08-0${index + 1}T00:00:00.000Z`);
    const baseline = 100 + index;
    return {
      id: `sustained-${index + 1}`,
      captureArtifactHash: sha256(10_000 + index),
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: new Date(startedAtMs + 600_000).toISOString(),
      cameraPreviewBaselineMiB: baseline,
      checkpoints: Array.from({ length: 11 }, (_, minute) => ({
        atMs: minute * 60_000,
        previewFps: 24 + index + minute / 100,
        recognitionDurationMs:
          minute >= 8 ? 1_250 + index : 1_000 + index,
        memoryMiB:
          minute === 5
            ? baseline + 300
            : minute === 2
              ? baseline + 100
              : minute === 10
                ? baseline + 125
                : baseline + 110,
        batteryDrainPercentagePoints: (20 / 6) * (minute / 10),
        crashes: 0,
        reloads: 0,
        thermalWarnings: 0,
        cameraInterruptions: 0,
        forcedRecoveries: 0
      }))
    };
  };

  const positiveOccurrences = new Map<QualificationStratum, number>();
  const trials = manifest.fixtures.map((fixture, index) => {
    const occurrence = positiveOccurrences.get(fixture.stratum) ?? 0;
    const positive = fixture.markerClass !== null;
    if (positive) positiveOccurrences.set(fixture.stratum, occurrence + 1);
    const focused = positive && occurrence < 36;
    return {
      fixtureId: fixture.id,
      trialId: `performance-trial-${index}`,
      captureArtifactHash: sha256(index + 1),
      capturedAt: new Date(
        Date.parse("2026-07-01T00:00:00.000Z") + index * 60_000
      ).toISOString(),
      guidePassDurationsMs: [900 + index / 1_000],
      discoveryPassDurationsMs: [1_800 + index / 1_000],
      searchingOrStabilizingGuideIntervalsMs: [1_400 + index / 10_000],
      searchingOrStabilizingDiscoveryIntervalsMs: [3_900 + index / 10_000],
      yieldsBetweenPassesMs: [250 + index / 1_000],
      focusOutcome: focused ? "focused" as const : "not-focused" as const,
      focusedPriceLatencyMs: focused ? 1_000 : null,
      focusedGuideIntervalsMs: focused ? [1_900 + index / 10_000] : [],
      focusedDiscoveryIntervalsMs: focused ? [4_900 + index / 10_000] : []
    };
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
      trials
    },
    resources: {
      firstInstallTransferMiB: 60,
      cachedProfileStorageMiB: 75
    },
    sustainedRuns: [
      sustainedRun(0),
      sustainedRun(1),
      sustainedRun(2)
    ]
  };
}

function passingReliabilityRecords(manifest: QualificationManifest) {
  const exactPrice = { sourceCurrency: "JPY", minorUnits: 12_345 } as const;
  const positiveOccurrences = new Map<QualificationStratum, number>();
  return manifest.fixtures.map((entry) => {
    const positive = entry.markerClass !== null;
    const occurrence = positiveOccurrences.get(entry.stratum) ?? 0;
    if (positive) positiveOccurrences.set(entry.stratum, occurrence + 1);
    const successful = positive && occurrence < 36;
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
      focusTransitions: successful
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
    expect(report.sceneRun).toMatchObject({
      completeTrialCount: 299,
      uniqueMeasurementCount: 299,
      focusedPositiveTrialCount: 108,
      guidePassSampleCount: 299,
      discoveryPassSampleCount: 299,
      focusedPriceSampleCount: 108
    });
    expect(report.sustainedRuns).toHaveLength(3);
    expect(report.sustainedRuns[0]).toMatchObject({
      checkpointCount: 11,
      additionalPeakMemoryMiB: 300,
      minute2To10MemoryGrowthMiB: 25
    });
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
      sceneRun: { trials: evidence.sceneRun.trials.slice(1) }
    })],
    ["Guide p95", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: {
        trials: evidence.sceneRun.trials.map((trial) => ({
          ...trial,
          guidePassDurationsMs: [1_001]
        }))
      }
    })],
    ["discovery p95", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: {
        trials: evidence.sceneRun.trials.map((trial) => ({
          ...trial,
          discoveryPassDurationsMs: [2_001]
        }))
      }
    })],
    ["Searching Guide cadence", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: { trials: evidence.sceneRun.trials.map((trial) => ({
        ...trial,
        searchingOrStabilizingGuideIntervalsMs: [1_501]
      })) }
    })],
    ["Searching discovery cadence", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: { trials: evidence.sceneRun.trials.map((trial) => ({
        ...trial,
        searchingOrStabilizingDiscoveryIntervalsMs: [4_001]
      })) }
    })],
    ["Focused Guide cadence", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: { trials: evidence.sceneRun.trials.map((trial) => ({
        ...trial,
        focusedGuideIntervalsMs:
          trial.focusOutcome === "focused" ? [2_001] : []
      })) }
    })],
    ["Focused discovery cadence", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: { trials: evidence.sceneRun.trials.map((trial) => ({
        ...trial,
        focusedDiscoveryIntervalsMs:
          trial.focusOutcome === "focused" ? [5_001] : []
      })) }
    })],
    ["yield", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: { trials: evidence.sceneRun.trials.map((trial) => ({
        ...trial,
        yieldsBetweenPassesMs: [249]
      })) }
    })],
    ["Focused Price deadline", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sceneRun: { trials: evidence.sceneRun.trials.map((trial) => ({
        ...trial,
        focusedPriceLatencyMs:
          trial.focusOutcome === "focused" ? 5_001 : null
      })) }
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
      sustainedRuns: evidence.sustainedRuns.map((run, runIndex) =>
        runIndex === 0
          ? {
              ...run,
              checkpoints: run.checkpoints.map((checkpoint, index) =>
                index === 5
                  ? {
                      ...checkpoint,
                      memoryMiB: run.cameraPreviewBaselineMiB + 300.01
                    }
                  : checkpoint
              )
            }
          : run
      )
    })],
    ["minute-2-to-10 memory growth", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, runIndex) =>
        runIndex === 0
          ? {
              ...run,
              checkpoints: run.checkpoints.map((checkpoint) =>
                checkpoint.atMs === 600_000
                  ? { ...checkpoint, memoryMiB: run.cameraPreviewBaselineMiB + 125.01 }
                  : checkpoint
              )
            }
          : run
      )
    })],
    ["three sustained runs", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.slice(1)
    })],
    ["non-overlapping sustained runs", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 1
          ? {
              ...run,
              startedAt: evidence.sustainedRuns[0].startedAt,
              endedAt: evidence.sustainedRuns[0].endedAt
            }
          : run
      )
    })],
    ["unique sustained capture artifacts", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 1
          ? {
              ...run,
              captureArtifactHash:
                evidence.sustainedRuns[0].captureArtifactHash
            }
          : run
      )
    })],
    ["ten-minute run duration", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 0
          ? {
              ...run,
              endedAt: new Date(Date.parse(run.startedAt) + 599_999).toISOString()
            }
          : run
      )
    })],
    ["crash result", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 0
          ? {
              ...run,
              checkpoints: run.checkpoints.map((checkpoint, checkpointIndex) =>
                checkpointIndex === 5 ? { ...checkpoint, crashes: 1 } : checkpoint
              )
            }
          : run
      )
    })],
    ["reload result", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 2
          ? {
              ...run,
              checkpoints: run.checkpoints.map((checkpoint, checkpointIndex) =>
                checkpointIndex === 5 ? { ...checkpoint, reloads: 1 } : checkpoint
              )
            }
          : run
      )
    })],
    ["thermal warning result", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 0
          ? {
              ...run,
              checkpoints: run.checkpoints.map((checkpoint, checkpointIndex) =>
                checkpointIndex === 5
                  ? { ...checkpoint, thermalWarnings: 1 }
                  : checkpoint
              )
            }
          : run
      )
    })],
    ["camera interruption result", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 0
          ? {
              ...run,
              checkpoints: run.checkpoints.map((checkpoint, checkpointIndex) =>
                checkpointIndex === 5
                  ? { ...checkpoint, cameraInterruptions: 1 }
                  : checkpoint
              )
            }
          : run
      )
    })],
    ["forced recovery result", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 0
          ? {
              ...run,
              checkpoints: run.checkpoints.map((checkpoint, checkpointIndex) =>
                checkpointIndex === 5
                  ? { ...checkpoint, forcedRecoveries: 1 }
                  : checkpoint
              )
            }
          : run
      )
    })],
    ["preview frame rate", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 1
          ? {
              ...run,
              checkpoints: run.checkpoints.map((checkpoint, checkpointIndex) =>
                checkpointIndex === 5 ? { ...checkpoint, previewFps: 23.99 } : checkpoint
              )
            }
          : run
      )
    })],
    ["late-run slowdown", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 1
          ? {
              ...run,
              checkpoints: run.checkpoints.map((checkpoint) =>
                checkpoint.atMs >= 480_000
                  ? { ...checkpoint, recognitionDurationMs: 1_300 }
                  : checkpoint
              )
            }
          : run
      )
    })],
    ["battery drain", (evidence: PerformanceQualificationEvidence) => ({
      ...evidence,
      sustainedRuns: evidence.sustainedRuns.map((run, index) =>
        index === 0
          ? {
              ...run,
              checkpoints: run.checkpoints.map((checkpoint) => ({
                ...checkpoint,
                batteryDrainPercentagePoints:
                  3.34 * (checkpoint.atMs / 600_000)
              }))
            }
          : run
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
      sceneRun: {
        trials: evidence.sceneRun.trials.map((trial, index) =>
          index === 0 ? { ...trial, guidePassDurationsMs: [] } : trial
        )
      }
    });

    expect(report.evidenceComplete).toBe(false);
    expect(report.performanceEligible).toBe(false);
    expect(report.failures).toContainEqual(
      expect.objectContaining({ id: "scene.complete-trial-count", actual: 298 })
    );
  });

  it("rejects copied one-scene measurements even when all fixture IDs are present", () => {
    const manifest = validManifest();
    const evidence = passingEvidence(manifest);
    const source = evidence.sceneRun.trials[0];
    const copied = evidence.sceneRun.trials.map((trial) => ({
      ...trial,
      guidePassDurationsMs: source.guidePassDurationsMs,
      discoveryPassDurationsMs: source.discoveryPassDurationsMs,
      searchingOrStabilizingGuideIntervalsMs:
        source.searchingOrStabilizingGuideIntervalsMs,
      searchingOrStabilizingDiscoveryIntervalsMs:
        source.searchingOrStabilizingDiscoveryIntervalsMs,
      yieldsBetweenPassesMs: source.yieldsBetweenPassesMs,
      focusOutcome: source.focusOutcome,
      focusedPriceLatencyMs: source.focusedPriceLatencyMs,
      focusedGuideIntervalsMs: source.focusedGuideIntervalsMs,
      focusedDiscoveryIntervalsMs: source.focusedDiscoveryIntervalsMs
    }));

    const report = scorePerformanceQualification(manifest, {
      ...evidence,
      sceneRun: { trials: copied }
    });

    expect(report.sceneRun.sceneCount).toBe(299);
    expect(report.sceneRun.uniqueMeasurementCount).toBe(1);
    expect(report.performanceEligible).toBe(false);
    expect(report.failures).toContainEqual(
      expect.objectContaining({ id: "scene.unique-evidence-count" })
    );
  });

  it("requires independently identified evidence for every fixture trial", () => {
    const manifest = validManifest();
    const evidence = passingEvidence(manifest);
    const first = evidence.sceneRun.trials[0];
    const trials = evidence.sceneRun.trials.map((trial, index) =>
      index === 1
        ? {
            ...trial,
            trialId: first.trialId,
            captureArtifactHash: first.captureArtifactHash,
            capturedAt: first.capturedAt
          }
        : trial
    );
    const report = scorePerformanceQualification(manifest, {
      ...evidence,
      sceneRun: { trials }
    });

    expect(report.sceneRun.uniqueMeasurementCount).toBe(299);
    expect(report.performanceEligible).toBe(false);
    expect(report.failures).toContainEqual(
      expect.objectContaining({ id: "scene.unique-evidence-count" })
    );
  });

  it("rejects copied sustained telemetry behind distinct caller-supplied IDs", () => {
    const manifest = validManifest();
    const evidence = passingEvidence(manifest);
    const source = evidence.sustainedRuns[0];
    const sustainedRuns = evidence.sustainedRuns.map((run) => ({
      ...run,
      cameraPreviewBaselineMiB: source.cameraPreviewBaselineMiB,
      checkpoints: [...source.checkpoints].reverse()
    }));
    const report = scorePerformanceQualification(manifest, {
      ...evidence,
      sustainedRuns
    });

    expect(report.sustainedRuns.every(({ passed }) => passed)).toBe(true);
    expect(report.performanceEligible).toBe(false);
    expect(report.failures).toContainEqual(
      expect.objectContaining({ id: "sustained.run-count" })
    );
  });

  it("requires minute-by-minute checkpoints throughout every sustained run", () => {
    const manifest = validManifest();
    const evidence = passingEvidence(manifest);
    const sustainedRuns = evidence.sustainedRuns.map((run, index) =>
      index === 1
        ? {
            ...run,
            checkpoints: run.checkpoints.filter(({ atMs }) => atMs !== 300_000)
          }
        : run
    );
    const report = scorePerformanceQualification(manifest, {
      ...evidence,
      sustainedRuns
    });

    expect(report.sustainedRuns[1].checkpointCount).toBe(10);
    expect(report.sustainedRuns[1].passed).toBe(false);
    expect(report.failures).toContainEqual(
      expect.objectContaining({ id: "sustained.2.checkpoint-coverage" })
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
    expect(Object.isFrozen(evidence.sceneRun.trials[0])).toBe(true);
    expect(Object.isFrozen(evidence.sustainedRuns[0].checkpoints)).toBe(true);
    expect(() =>
      createPerformanceQualificationEvidence(manifest, {
        ...input,
        browser: { ...input.browser, version: "different" }
      })
    ).toThrow(/match the qualification block/i);
    expect(() =>
      createPerformanceQualificationEvidence(manifest, {
        ...input,
        sustainedRuns: input.sustainedRuns.map((run, index) =>
          index === 0
            ? {
                ...run,
                captureArtifactHash: "sha256:not-a-hash"
              }
            : run
        )
      })
    ).toThrow(/SHA-256 capture artifact hash/i);
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
    expect(passed.evidenceAligned).toBe(true);
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

  it("binds successful reliability trials to the same fixture performance evidence", () => {
    const manifest = validManifest();
    const evidence = passingEvidence(manifest);
    const changedTrials = evidence.sceneRun.trials.map((trial, index) =>
      index === 0 ? { ...trial, focusedPriceLatencyMs: 1_001 } : trial
    );
    const report = scoreProfileQualification(
      manifest,
      passingReliabilityRecords(manifest),
      { ...evidence, sceneRun: { trials: changedTrials } }
    );

    expect(report.reliability.qualified).toBe(true);
    expect(report.performance.performanceEligible).toBe(true);
    expect(report.evidenceAligned).toBe(false);
    expect(report.qualified).toBe(false);
  });
});
