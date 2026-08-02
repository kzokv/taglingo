// PROTOTYPE: pure performance-budget evaluator. No I/O or persistence.

export const PERFORMANCE_BUDGET = {
  measurementNetwork: {
    downMbps: 10,
    roundTripMs: 150
  },
  readiness: {
    manualEntryInteractiveP95Ms: 2_500,
    previewAfterPermissionP95Ms: 2_000,
    uncachedProfileReadyP95Ms: 30_000,
    cachedProfileReadyP95Ms: 3_000
  },
  recognition: {
    guidePassP95Ms: 1_000,
    discoveryPassP95Ms: 2_000,
    focusedPriceDeadlineMs: 5_000
  },
  assets: {
    firstInstallTransferMiB: 60,
    cachedProfileMiB: 75
  },
  memory: {
    additionalPeakMiB: 300,
    minute2To10GrowthMiB: 25
  },
  cadence: {
    searchingGuideMaxIntervalMs: 1_500,
    searchingDiscoveryMaxIntervalMs: 4_000,
    focusedGuideMaxIntervalMs: 2_000,
    focusedDiscoveryMaxIntervalMs: 5_000,
    minimumYieldMs: 250,
    maximumInFlight: 1,
    replaceablePendingFrames: 1
  },
  sustained: {
    durationMinutes: 10,
    minimumPreviewFps: 24,
    maximumP95SlowdownPercent: 25,
    maximumBatteryPointsPerHour: 20
  }
};

const trace = (overrides) => ({
  key: "trace",
  name: "Synthetic trace",
  engine: "unknown",
  platform: "unknown",
  manualEntryInteractiveP95Ms: 2_000,
  previewAfterPermissionP95Ms: 1_500,
  uncachedProfileReadyP95Ms: 20_000,
  cachedProfileReadyP95Ms: 2_000,
  guidePassP95Ms: 800,
  discoveryPassP95Ms: 1_600,
  focusedPriceP95Ms: 3_500,
  firstInstallTransferMiB: 40,
  cachedProfileMiB: 55,
  additionalPeakMiB: 230,
  minute2To10GrowthMiB: 12,
  searchingGuideMaxIntervalMs: 1_300,
  searchingDiscoveryMaxIntervalMs: 3_700,
  focusedGuideMaxIntervalMs: 1_800,
  focusedDiscoveryMaxIntervalMs: 4_600,
  minimumYieldMs: 250,
  maximumInFlight: 1,
  pendingFramePolicy: "replace-newest",
  minimumPreviewFps: 28,
  p95SlowdownPercent: 18,
  batteryPointsPerHour: 16,
  interruption: false,
  ...overrides
});

export const SAMPLE_TRACES = {
  paddlePass: trace({
    key: "paddlePass",
    name: "Paddle v6 · measured inside the envelope",
    engine: "PaddleOCR.js · PP-OCRv6 small",
    platform: "synthetic current iOS Safari",
    uncachedProfileReadyP95Ms: 28_400,
    cachedProfileReadyP95Ms: 2_800,
    guidePassP95Ms: 920,
    discoveryPassP95Ms: 1_850,
    firstInstallTransferMiB: 55,
    cachedProfileMiB: 68,
    additionalPeakMiB: 286,
    minute2To10GrowthMiB: 18,
    minimumPreviewFps: 29,
    p95SlowdownPercent: 19,
    batteryPointsPerHour: 18
  }),
  paddleFail: trace({
    key: "paddleFail",
    name: "Paddle v6 · overloaded physical profile",
    engine: "PaddleOCR.js · PP-OCRv6 small",
    platform: "synthetic representative Android Chrome",
    manualEntryInteractiveP95Ms: 2_700,
    previewAfterPermissionP95Ms: 2_300,
    uncachedProfileReadyP95Ms: 38_000,
    cachedProfileReadyP95Ms: 4_100,
    guidePassP95Ms: 1_300,
    discoveryPassP95Ms: 2_800,
    focusedPriceP95Ms: 5_900,
    firstInstallTransferMiB: 55,
    cachedProfileMiB: 68,
    additionalPeakMiB: 370,
    minute2To10GrowthMiB: 50,
    searchingGuideMaxIntervalMs: 1_900,
    searchingDiscoveryMaxIntervalMs: 5_600,
    focusedGuideMaxIntervalMs: 2_600,
    focusedDiscoveryMaxIntervalMs: 6_800,
    minimumPreviewFps: 20,
    p95SlowdownPercent: 42,
    batteryPointsPerHour: 28
  }),
  paddleV5: trace({
    key: "paddleV5",
    name: "Paddle v5 mobile · lean comparison",
    engine: "PaddleOCR.js · PP-OCRv5 mobile",
    platform: "synthetic current iOS Safari",
    uncachedProfileReadyP95Ms: 23_000,
    cachedProfileReadyP95Ms: 2_600,
    guidePassP95Ms: 840,
    discoveryPassP95Ms: 1_750,
    firstInstallTransferMiB: 45,
    cachedProfileMiB: 58,
    additionalPeakMiB: 250,
    minute2To10GrowthMiB: 14,
    minimumPreviewFps: 30,
    p95SlowdownPercent: 16,
    batteryPointsPerHour: 17
  }),
  tesseract: trace({
    key: "tesseract",
    name: "Tesseract 7 · control",
    engine: "Tesseract.js 7",
    platform: "synthetic current iOS Safari",
    uncachedProfileReadyP95Ms: 8_000,
    cachedProfileReadyP95Ms: 2_000,
    guidePassP95Ms: 750,
    discoveryPassP95Ms: 1_600,
    firstInstallTransferMiB: 7,
    cachedProfileMiB: 15,
    additionalPeakMiB: 190,
    minute2To10GrowthMiB: 10,
    minimumPreviewFps: 31,
    p95SlowdownPercent: 12,
    batteryPointsPerHour: 14
  })
};

const atMost = (name, actual, limit, unit) => ({
  name,
  actual,
  limit,
  unit,
  pass: actual <= limit
});

const atLeast = (name, actual, limit, unit) => ({
  name,
  actual,
  limit,
  unit,
  pass: actual >= limit
});

export function evaluateTrace(candidate, budget = PERFORMANCE_BUDGET) {
  const checks = [
    atMost("Manual Price Entry interactive p95", candidate.manualEntryInteractiveP95Ms, budget.readiness.manualEntryInteractiveP95Ms, "ms"),
    atMost("Preview after permission p95", candidate.previewAfterPermissionP95Ms, budget.readiness.previewAfterPermissionP95Ms, "ms"),
    atMost("Uncached recognition-ready p95", candidate.uncachedProfileReadyP95Ms, budget.readiness.uncachedProfileReadyP95Ms, "ms"),
    atMost("Cached recognition-ready p95", candidate.cachedProfileReadyP95Ms, budget.readiness.cachedProfileReadyP95Ms, "ms"),
    atMost("Capture Guide pass p95", candidate.guidePassP95Ms, budget.recognition.guidePassP95Ms, "ms"),
    atMost("Full-preview discovery pass p95", candidate.discoveryPassP95Ms, budget.recognition.discoveryPassP95Ms, "ms"),
    atMost("Stable Focused Price p95", candidate.focusedPriceP95Ms, budget.recognition.focusedPriceDeadlineMs, "ms"),
    atMost("First-install transfer", candidate.firstInstallTransferMiB, budget.assets.firstInstallTransferMiB, "MiB"),
    atMost("Cached recognition profile", candidate.cachedProfileMiB, budget.assets.cachedProfileMiB, "MiB"),
    atMost("Additional peak memory", candidate.additionalPeakMiB, budget.memory.additionalPeakMiB, "MiB"),
    atMost("Memory growth minute 2→10", candidate.minute2To10GrowthMiB, budget.memory.minute2To10GrowthMiB, "MiB"),
    atMost("Searching Guide interval", candidate.searchingGuideMaxIntervalMs, budget.cadence.searchingGuideMaxIntervalMs, "ms"),
    atMost("Searching discovery interval", candidate.searchingDiscoveryMaxIntervalMs, budget.cadence.searchingDiscoveryMaxIntervalMs, "ms"),
    atMost("Focused Guide interval", candidate.focusedGuideMaxIntervalMs, budget.cadence.focusedGuideMaxIntervalMs, "ms"),
    atMost("Focused discovery interval", candidate.focusedDiscoveryMaxIntervalMs, budget.cadence.focusedDiscoveryMaxIntervalMs, "ms"),
    atLeast("Yield between passes", candidate.minimumYieldMs, budget.cadence.minimumYieldMs, "ms"),
    atMost("Concurrent inference", candidate.maximumInFlight, budget.cadence.maximumInFlight, "pass"),
    {
      name: "Pending frame replaces older work",
      actual: candidate.pendingFramePolicy,
      limit: "replace-newest",
      unit: "policy",
      pass: candidate.pendingFramePolicy === "replace-newest"
    },
    atLeast("Sustained preview", candidate.minimumPreviewFps, budget.sustained.minimumPreviewFps, "fps"),
    atMost("Recognition slowdown by minute 10", candidate.p95SlowdownPercent, budget.sustained.maximumP95SlowdownPercent, "%"),
    atMost("Extrapolated battery drain", candidate.batteryPointsPerHour, budget.sustained.maximumBatteryPointsPerHour, "points/hour"),
    {
      name: "No crash, reload, thermal warning, or camera interruption",
      actual: candidate.interruption ? "interrupted" : "clear",
      limit: "clear",
      unit: "state",
      pass: !candidate.interruption
    }
  ];

  const failures = checks.filter(({ pass }) => !pass);
  return {
    candidate,
    checks,
    failures,
    performanceEligible: failures.length === 0,
    disposition: failures.length === 0
      ? "Performance gate passes; accuracy and safety evidence still required"
      : "Camera profile ineligible on this platform; keep Manual Price Entry"
  };
}
