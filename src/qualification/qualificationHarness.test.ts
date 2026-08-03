import { describe, expect, it } from "vitest";

import {
  createFrozenTrialRecord,
  createQualificationManifest,
  retireHeldOutFixture,
  scoreProfileQualification,
  scoreQualification,
  type FixtureManifestEntry,
  type QualificationChallenge,
  type QualificationManifest,
  type TrialCaptureInput
} from "./qualificationHarness";

const POSITIVE_STRATA = [
  "clean-single-price",
  "difficult-single-price",
  "complex-selection"
] as const;

const NEGATIVE_STRATA = [
  ["non-price-numerals", 45],
  ["wrong-or-unsupported-currency", 45],
  ["malformed-or-ambiguous-fragment", 45],
  ["realistic-no-price-retail", 44]
] as const;

const REQUIRED_CHALLENGES: readonly QualificationChallenge[] = [
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

function fixture(
  id: string,
  stratum: FixtureManifestEntry["stratum"],
  overrides: Partial<FixtureManifestEntry> = {}
): FixtureManifestEntry {
  const positive = POSITIVE_STRATA.includes(
    stratum as (typeof POSITIVE_STRATA)[number]
  );
  return {
    id,
    stratum,
    inventory: "held-out",
    provenance: { kind: "consented", reference: `consent:${id}` },
    markerClass: positive ? "symbol" : null,
    numberFormatClass: positive ? "standard" : null,
    challenges: REQUIRED_CHALLENGES,
    ...overrides
  };
}

function validManifest(): QualificationManifest {
  const fixtures: FixtureManifestEntry[] = [];
  for (const stratum of POSITIVE_STRATA) {
    for (let index = 0; index < 40; index += 1) {
      fixtures.push(fixture(`${stratum}-${index}`, stratum));
    }
  }
  for (const [stratum, count] of NEGATIVE_STRATA) {
    for (let index = 0; index < count; index += 1) {
      fixtures.push(fixture(`${stratum}-${index}`, stratum));
    }
  }

  return createQualificationManifest({
    version: "qualification-manifest.v1",
    configuration: {
      sourceCurrency: "JPY",
      platform: "ios",
      profileId: "jpy-ios-v1",
      profileVersion: "recognition-profile.v1",
      profileHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      evidenceVersion: "jpy-ios-evidence-v1",
      acceptedMarkerClasses: ["symbol"],
      acceptedNumberFormatClasses: ["standard"]
    },
    device: {
      model: "iPhone 16 Pro",
      osName: "iOS",
      osVersion: "19.0",
      releaseStatus: "current"
    },
    browser: {
      name: "Safari",
      version: "19.0",
      releaseStatus: "current"
    },
    fixtures
  });
}

function successfulInput(
  manifest: QualificationManifest,
  entry: FixtureManifestEntry,
  overrides: Partial<TrialCaptureInput> = {}
): TrialCaptureInput {
  const fixtureIndex = manifest.fixtures.findIndex(({ id }) => id === entry.id);
  const positive = POSITIVE_STRATA.includes(
    entry.stratum as (typeof POSITIVE_STRATA)[number]
  );
  const expectedPrice = {
    sourceCurrency: manifest.configuration.sourceCurrency,
    minorUnits: 12_345
  } as const;
  return {
    fixtureId: entry.id,
    trialId: `qualification-trial-${fixtureIndex}`,
    captureArtifactHash: `sha256:${(fixtureIndex + 1)
      .toString(16)
      .padStart(64, "0")}`,
    capturedAt: new Date(
      Date.parse("2026-07-01T00:00:00.000Z") + fixtureIndex * 60_000
    ).toISOString(),
    stratum: entry.stratum,
    configuration: manifest.configuration,
    device: manifest.device,
    browser: manifest.browser,
    timings: {
      recognitionReadyMs: 1_200,
      observationWindowMs: 10_000,
      geometryMs: positive ? 5_000 : null
    },
    expectation: positive ? expectedPrice : null,
    focusTransitions: positive
      ? [{ atMs: 5_000, focusedPrice: expectedPrice }]
      : [],
    geometry: positive ? { oneToOne: true, iou: 0.500_001 } : null,
    terminalOutcome: "completed",
    ...overrides
  };
}

function recordsFor(
  manifest: QualificationManifest,
  change: (
    input: TrialCaptureInput,
    entry: FixtureManifestEntry,
    index: number
  ) => TrialCaptureInput = (input) => input
) {
  return manifest.fixtures.map((entry, index) =>
    createFrozenTrialRecord(
      manifest,
      change(successfulInput(manifest, entry), entry, index)
    )
  );
}

describe("qualification manifest", () => {
  it("requires the exact approved 120-positive and 179-negative strata", () => {
    const manifest = validManifest();

    expect(manifest.fixtures).toHaveLength(299);
    expect(Object.isFrozen(manifest.fixtures)).toBe(true);
    expect(() =>
      createQualificationManifest({
        ...manifest,
        fixtures: manifest.fixtures.slice(1)
      })
    ).toThrow(/40 clean-single-price/i);

    const wrongStratum = manifest.fixtures.map((entry, index) =>
      index === 0
        ? { ...entry, stratum: "difficult-single-price" as const }
        : entry
    );
    expect(() =>
      createQualificationManifest({ ...manifest, fixtures: wrongStratum })
    ).toThrow(/40 clean-single-price/i);
  });

  it("rejects duplicate identities, development fixtures, and missing provenance", () => {
    const manifest = validManifest();
    const duplicate = manifest.fixtures.map((entry, index) =>
      index === 1 ? { ...entry, id: manifest.fixtures[0].id } : entry
    );
    expect(() =>
      createQualificationManifest({ ...manifest, fixtures: duplicate })
    ).toThrow(/unique fixture/i);

    const development = manifest.fixtures.map((entry, index) =>
      index === 0 ? { ...entry, inventory: "development" as const } : entry
    );
    expect(() =>
      createQualificationManifest({ ...manifest, fixtures: development })
    ).toThrow(/held-out/i);

    const missingProvenance = manifest.fixtures.map((entry, index) =>
      index === 0
        ? { ...entry, provenance: { ...entry.provenance, reference: "" } }
        : entry
    );
    expect(() =>
      createQualificationManifest({
        ...manifest,
        fixtures: missingProvenance
      })
    ).toThrow(/provenance/i);
  });

  it("enforces accepted marker/format coverage and the retail challenge portfolio", () => {
    const manifest = validManifest();
    const withNineCodeMarkers = manifest.fixtures.map((entry, index) =>
      index < 9 ? { ...entry, markerClass: "currency-code" } : entry
    );
    expect(() =>
      createQualificationManifest({
        ...manifest,
        configuration: {
          ...manifest.configuration,
          acceptedMarkerClasses: ["symbol", "currency-code"]
        },
        fixtures: withNineCodeMarkers
      })
    ).toThrow(/at least 10 positive scenes/i);

    const withNineDecimalFormats = manifest.fixtures.map((entry, index) =>
      index < 9 ? { ...entry, numberFormatClass: "decimal" } : entry
    );
    expect(() =>
      createQualificationManifest({
        ...manifest,
        configuration: {
          ...manifest.configuration,
          acceptedNumberFormatClasses: ["standard", "decimal"]
        },
        fixtures: withNineDecimalFormats
      })
    ).toThrow(/at least 10 positive scenes/i);

    const withoutGlare = manifest.fixtures.map((entry) => ({
      ...entry,
      challenges: entry.challenges.filter((challenge) => challenge !== "glare")
    }));
    expect(() =>
      createQualificationManifest({ ...manifest, fixtures: withoutGlare })
    ).toThrow(/does not cover glare/i);
  });

  it("enforces one current physical device/browser block per platform", () => {
    const ios = validManifest();
    expect(() =>
      createQualificationManifest({
        ...ios,
        browser: { ...ios.browser, name: "Chrome" }
      })
    ).toThrow(/iOS Safari/i);

    const android = createQualificationManifest({
      ...ios,
      configuration: { ...ios.configuration, platform: "android" },
      device: {
        model: "Pixel 10 Pro",
        osName: "Android",
        osVersion: "17",
        releaseStatus: "current"
      },
      browser: {
        name: "Chrome",
        version: "140",
        releaseStatus: "current"
      }
    });
    expect(android.configuration.platform).toBe("android");
    expect(() =>
      createQualificationManifest({
        ...android,
        device: { ...android.device, model: "generic" }
      })
    ).toThrow(/named representative device/i);
  });

  it("retires an inspected fixture and requires a fresh same-stratum replacement", () => {
    const manifest = validManifest();
    const retired = manifest.fixtures[0];
    const { manifest: replaced, retiredFixture } = retireHeldOutFixture(
      manifest,
      retired.id,
      fixture("clean-replacement", retired.stratum)
    );

    expect(retiredFixture).toEqual({ ...retired, inventory: "development" });
    expect(replaced.fixtures.some(({ id }) => id === retired.id)).toBe(false);
    expect(replaced.fixtures.some(({ id }) => id === "clean-replacement")).toBe(
      true
    );
    expect(() =>
      retireHeldOutFixture(
        manifest,
        retired.id,
        fixture("wrong-stratum", "difficult-single-price")
      )
    ).toThrow(/same stratum/i);
    expect(() =>
      retireHeldOutFixture(
        manifest,
        retired.id,
        fixture(manifest.fixtures[1].id, retired.stratum)
      )
    ).toThrow(/fresh fixture identity/i);
  });
});

describe("privacy-safe frozen records", () => {
  it("derives exact-price classifications but persists only the content-free schema", () => {
    const manifest = validManifest();
    const input = successfulInput(manifest, manifest.fixtures[0]);
    const record = createFrozenTrialRecord(manifest, input);
    const mismatch = createFrozenTrialRecord(manifest, {
      ...input,
      focusTransitions: [
        {
          atMs: 1,
          focusedPrice: {
            sourceCurrency: "JPY",
            minorUnits: 12_346
          }
        }
      ]
    });

    expect(record.focusTransitions[0].classification).toBe("expected");
    expect(mismatch.focusTransitions[0].classification).toBe("incorrect");
    expect(Object.keys(record).sort()).toEqual([
      "browser",
      "captureArtifactHash",
      "capturedAt",
      "configuration",
      "device",
      "fixtureId",
      "focusTransitions",
      "geometry",
      "stratum",
      "terminalOutcome",
      "timings",
      "trialId"
    ]);
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.focusTransitions)).toBe(true);
    expect(JSON.stringify(record)).not.toMatch(
      /expectation|focusedPrice|cameraFrame|ocr|token|minorUnits|coordinates/i
    );
  });

  it.each(["cameraFrame", "ocrText", "recognizedPrice", "rawCoordinates"])(
    "rejects a prohibited or unknown %s field",
    (field) => {
      const manifest = validManifest();
      const unsafe = {
        ...successfulInput(manifest, manifest.fixtures[0]),
        [field]: "content"
      };
      expect(() => createFrozenTrialRecord(manifest, unsafe)).toThrow(
        /unknown or missing trial field/i
      );
    }
  );

  it("verifies expected values and frozen manifest metadata", () => {
    const manifest = validManifest();
    const input = successfulInput(manifest, manifest.fixtures[0]);
    expect(() =>
      createFrozenTrialRecord(manifest, {
        ...input,
        expectation: { sourceCurrency: "USD", minorUnits: 12_345 }
      })
    ).toThrow(/exact expected Source Currency/i);
    expect(() =>
      createFrozenTrialRecord(manifest, {
        ...input,
        fixtureId: "not-declared"
      })
    ).toThrow(/not declared/i);
    expect(() =>
      createFrozenTrialRecord(manifest, {
        ...input,
        browser: { ...input.browser, version: "changed" }
      })
    ).toThrow(/device and browser/i);
  });

  it("rejects negative expectations and inconsistent geometry telemetry", () => {
    const manifest = validManifest();
    const negative = successfulInput(manifest, manifest.fixtures[120]);
    expect(() =>
      createFrozenTrialRecord(manifest, {
        ...negative,
        expectation: { sourceCurrency: "JPY", minorUnits: 1 }
      })
    ).toThrow(/negative fixture/i);

    const positive = successfulInput(manifest, manifest.fixtures[0]);
    expect(() =>
      createFrozenTrialRecord(manifest, { ...positive, geometry: null })
    ).toThrow(/timing and score/i);
  });

  it("rejects an invalid content-free capture artifact identity", () => {
    const manifest = validManifest();
    const input = successfulInput(manifest, manifest.fixtures[0]);

    expect(() =>
      createFrozenTrialRecord(manifest, {
        ...input,
        captureArtifactHash: "sha256:not-a-digest"
      })
    ).toThrow(/capture artifact hash/i);
  });
});

describe("qualification scorer", () => {
  it("keeps the profile Manual-Entry-only when performance evidence is missing", () => {
    const manifest = validManifest();
    const report = scoreProfileQualification(
      manifest,
      recordsFor(manifest),
      null
    );

    expect(report.reliability.qualified).toBe(true);
    expect(report.performance.performanceEligible).toBe(false);
    expect(report.qualified).toBe(false);
    expect(report.manualPriceEntryAvailable).toBe(true);
    expect(report.disposition).toMatch(/Manual Price Entry/i);
  });

  it("passes exactly at aggregate thresholds and reports exact bounds and latencies", () => {
    const manifest = validManifest();
    const failuresUsed = new Map(POSITIVE_STRATA.map((stratum) => [stratum, 0]));
    const records = recordsFor(manifest, (input, entry) => {
      if (
        POSITIVE_STRATA.includes(
          entry.stratum as (typeof POSITIVE_STRATA)[number]
        ) &&
        (failuresUsed.get(
          entry.stratum as (typeof POSITIVE_STRATA)[number]
        ) ?? 0) < 4
      ) {
        failuresUsed.set(
          entry.stratum as (typeof POSITIVE_STRATA)[number],
          (failuresUsed.get(
            entry.stratum as (typeof POSITIVE_STRATA)[number]
          ) ?? 0) + 1
        );
        return {
          ...input,
          focusTransitions: [
            { atMs: 5_001, focusedPrice: input.expectation! }
          ]
        };
      }
      return input;
    });

    const report = scoreQualification(manifest, records);

    expect(report.qualified).toBe(true);
    expect(report.positive).toMatchObject({
      successes: 108,
      total: 120,
      required: 108
    });
    expect(report.positive.byStratum["clean-single-price"].successes).toBe(36);
    expect(report.safety).toMatchObject({
      incorrectFocusedPrices: 0,
      sessions: 299,
      requiredSessions: 299,
      statement: "zero observed in 299"
    });
    expect(report.confidence.level).toBe(0.95);
    expect(report.confidence.positiveSuccessLowerBound).toBeCloseTo(
      0.843_016,
      5
    );
    expect(report.confidence.incorrectFocusUpperBound).toBeCloseTo(
      0.009_968,
      5
    );
    expect(report.successfulLatencyMs).toMatchObject({
      count: 108,
      min: 5_000,
      p50: 5_000,
      p95: 5_000,
      max: 5_000
    });
  });

  it("fails one below the overall and per-stratum positive thresholds", () => {
    const manifest = validManifest();
    const overall = scoreQualification(
      manifest,
      recordsFor(manifest, (input, entry, index) =>
        index < 13 &&
        POSITIVE_STRATA.includes(
          entry.stratum as (typeof POSITIVE_STRATA)[number]
        )
          ? { ...input, terminalOutcome: "timeout" }
          : input
      )
    );
    expect(overall.positive.successes).toBe(107);
    expect(overall.qualified).toBe(false);

    const stratum = scoreQualification(
      manifest,
      recordsFor(manifest, (input, entry, index) =>
        entry.stratum === "clean-single-price" && index < 5
          ? { ...input, terminalOutcome: "timeout" }
          : input
      )
    );
    expect(stratum.positive.successes).toBe(115);
    expect(stratum.positive.byStratum["clean-single-price"].successes).toBe(35);
    expect(stratum.qualified).toBe(false);
  });

  it.each([
    ["late focus", (input: TrialCaptureInput) => ({
      ...input,
      focusTransitions: [{ atMs: 5_001, focusedPrice: input.expectation! }]
    })],
    ["incorrect focus", (input: TrialCaptureInput) => ({
      ...input,
      focusTransitions: [{
        atMs: 10_000,
        focusedPrice: { sourceCurrency: "JPY" as const, minorUnits: 999 }
      }]
    })],
    ["IoU at the boundary", (input: TrialCaptureInput) => ({
      ...input,
      geometry: { oneToOne: true, iou: 0.5 }
    })],
    ["non-one-to-one geometry", (input: TrialCaptureInput) => ({
      ...input,
      geometry: { oneToOne: false, iou: 0.9 }
    })],
    ["missing geometry", (input: TrialCaptureInput) => ({
      ...input,
      geometry: null,
      timings: { ...input.timings, geometryMs: null }
    })],
    ["late geometry", (input: TrialCaptureInput) => ({
      ...input,
      timings: { ...input.timings, geometryMs: 5_001 }
    })],
    ["short observation", (input: TrialCaptureInput) => ({
      ...input,
      timings: { ...input.timings, observationWindowMs: 9_999 }
    })],
    ["crash", (input: TrialCaptureInput) => ({
      ...input,
      terminalOutcome: "crash" as const
    })],
    ["timeout", (input: TrialCaptureInput) => ({
      ...input,
      terminalOutcome: "timeout" as const
    })],
    ["missing telemetry", (input: TrialCaptureInput) => ({
      ...input,
      terminalOutcome: "missing-telemetry" as const
    })],
    ["undeclared exclusion", (input: TrialCaptureInput) => ({
      ...input,
      terminalOutcome: "excluded" as const
    })]
  ])("treats %s as a positive failure", (_name, change) => {
    const manifest = validManifest();
    const report = scoreQualification(
      manifest,
      recordsFor(manifest, (input, _entry, index) =>
        index === 0 ? change(input) : input
      )
    );
    expect(report.positive.successes).toBe(119);
    expect(report.failures).toContainEqual(
      expect.objectContaining({ fixtureId: manifest.fixtures[0].id })
    );
  });

  it("accepts the five-second and strict geometry success boundaries", () => {
    const manifest = validManifest();
    const report = scoreQualification(manifest, recordsFor(manifest));

    expect(report.positive.successes).toBe(120);
    expect(report.qualified).toBe(true);
    expect(report.confidence.positiveSuccessLowerBound).toBeCloseTo(
      0.975_346,
      5
    );
  });

  it("fails for one incorrect Focused Price in any of 299 sessions", () => {
    const manifest = validManifest();
    const records = recordsFor(manifest, (input, _entry, index) =>
      index === 298
        ? {
            ...input,
            focusTransitions: [
              {
                atMs: 1,
                focusedPrice: { sourceCurrency: "JPY", minorUnits: 999 }
              }
            ]
          }
        : input
    );
    const report = scoreQualification(manifest, records);

    expect(report.safety.incorrectFocusedPrices).toBe(1);
    expect(report.safety.statement).toBe("1 observed in 299");
    expect(report.qualified).toBe(false);
  });

  it("makes any missing telemetry an absolute blocker and uses observed denominators", () => {
    const manifest = validManifest();
    const records = recordsFor(manifest);
    const missing = scoreQualification(manifest, records.slice(1));

    expect(missing.positive.successes).toBe(119);
    expect(missing.failures[0]).toMatchObject({
      fixtureId: manifest.fixtures[0].id,
      reasons: ["missing-telemetry"]
    });
    expect(missing.safety).toMatchObject({
      sessions: 298,
      statement: "zero observed in 298"
    });
    expect(missing.confidence.incorrectFocusUpperBound).toBeGreaterThan(
      0.009_968
    );
    expect(missing.qualified).toBe(false);

    const declaredMissing = scoreQualification(
      manifest,
      recordsFor(manifest, (input, _entry, index) =>
        index === 0
          ? { ...input, terminalOutcome: "missing-telemetry" }
          : input
      )
    );
    expect(declaredMissing.safety.sessions).toBe(298);
    expect(declaredMissing.qualified).toBe(false);

    expect(() => scoreQualification(manifest, [...records, records[0]])).toThrow(
      /one independent trial/i
    );
  });

  it("requires a unique content-free capture identity for every fixture", () => {
    const manifest = validManifest();
    const records = recordsFor(manifest);
    const duplicateIdentity = {
      ...records[1],
      trialId: records[0].trialId
    };

    expect(() =>
      scoreQualification(manifest, [
        records[0],
        duplicateIdentity,
        ...records.slice(2)
      ])
    ).toThrow(/unique content-free capture identity/i);
  });
});
