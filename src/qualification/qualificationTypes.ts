import type { SourceCurrencyCode } from "../domain/currencies";
import type { RecognitionPlatform } from "../recognition/recognitionProfile";

export type PositiveQualificationStratum =
  | "clean-single-price"
  | "difficult-single-price"
  | "complex-selection";

export type NegativeQualificationStratum =
  | "non-price-numerals"
  | "wrong-or-unsupported-currency"
  | "malformed-or-ambiguous-fragment"
  | "realistic-no-price-retail";

export type QualificationStratum =
  | PositiveQualificationStratum
  | NegativeQualificationStratum;

export type QualificationChallenge =
  | "physical-tag"
  | "receipt"
  | "menu"
  | "vending-or-electronic-display"
  | "sale-formatting"
  | "lighting"
  | "glare"
  | "moire"
  | "distance"
  | "rotation"
  | "occlusion"
  | "multiple-prices"
  | "discount-pair"
  | "nearby-non-price-numerals";

export interface QualificationConfiguration {
  readonly sourceCurrency: SourceCurrencyCode;
  readonly platform: RecognitionPlatform;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly profileHash: `sha256:${string}`;
  readonly evidenceVersion: string;
  readonly acceptedMarkerClasses: readonly string[];
  readonly acceptedNumberFormatClasses: readonly string[];
}

export interface QualificationDevice {
  readonly model: string;
  readonly osName: "iOS" | "Android";
  readonly osVersion: string;
  readonly releaseStatus: "current";
}

export interface QualificationBrowser {
  readonly name: "Safari" | "Chrome";
  readonly version: string;
  readonly releaseStatus: "current";
}

export interface FixtureManifestEntry {
  readonly id: string;
  readonly stratum: QualificationStratum;
  readonly inventory: "development" | "held-out";
  readonly provenance: {
    readonly kind: "consented" | "licensed";
    readonly reference: string;
  };
  readonly markerClass: string | null;
  readonly numberFormatClass: string | null;
  readonly challenges: readonly QualificationChallenge[];
}

export interface QualificationManifest {
  readonly version: "qualification-manifest.v1";
  readonly configuration: QualificationConfiguration;
  readonly device: QualificationDevice;
  readonly browser: QualificationBrowser;
  readonly fixtures: readonly FixtureManifestEntry[];
}

export interface ExactPrice {
  readonly sourceCurrency: SourceCurrencyCode;
  readonly minorUnits: number;
}

export interface TrialCaptureInput {
  readonly fixtureId: string;
  readonly stratum: QualificationStratum;
  readonly configuration: QualificationConfiguration;
  readonly device: QualificationDevice;
  readonly browser: QualificationBrowser;
  readonly timings: {
    readonly recognitionReadyMs: number;
    readonly observationWindowMs: number;
    readonly geometryMs: number | null;
  };
  readonly expectation: ExactPrice | null;
  readonly focusTransitions: readonly {
    readonly atMs: number;
    readonly focusedPrice: ExactPrice;
  }[];
  readonly geometry: {
    readonly oneToOne: boolean;
    readonly iou: number;
  } | null;
  readonly terminalOutcome: TrialTerminalOutcome;
}

export interface FrozenTrialRecord {
  readonly fixtureId: string;
  readonly stratum: QualificationStratum;
  readonly configuration: QualificationConfiguration;
  readonly device: QualificationDevice;
  readonly browser: QualificationBrowser;
  readonly timings: TrialCaptureInput["timings"];
  readonly focusTransitions: readonly {
    readonly atMs: number;
    readonly classification: "expected" | "incorrect";
  }[];
  readonly geometry: TrialCaptureInput["geometry"];
  readonly terminalOutcome: TrialTerminalOutcome;
}

export type TrialTerminalOutcome =
  | "completed"
  | "crash"
  | "timeout"
  | "missing-telemetry"
  | "excluded";

export type TrialFailureReason =
  | "crash"
  | "timeout"
  | "missing-telemetry"
  | "undeclared-exclusion"
  | "observation-too-short"
  | "missing-or-late-focus"
  | "incorrect-focus"
  | "missing-geometry"
  | "late-geometry"
  | "failed-geometry";

export interface QualificationReport {
  readonly version: "qualification-report.v1";
  readonly configuration: QualificationConfiguration;
  readonly device: QualificationDevice;
  readonly browser: QualificationBrowser;
  readonly qualified: boolean;
  readonly positive: {
    readonly successes: number;
    readonly total: number;
    readonly required: number;
    readonly byStratum: Readonly<
      Record<
        PositiveQualificationStratum,
        { readonly successes: number; readonly total: number; readonly required: number }
      >
    >;
  };
  readonly negative: {
    readonly successes: number;
    readonly total: number;
    readonly required: number;
  };
  readonly safety: {
    readonly incorrectFocusedPrices: number;
    readonly sessions: number;
    readonly requiredSessions: number;
    readonly statement: string;
  };
  readonly confidence: {
    readonly level: number;
    readonly positiveSuccessLowerBound: number | null;
    readonly positiveStratumLowerBounds: Readonly<
      Record<PositiveQualificationStratum, number | null>
    >;
    readonly incorrectFocusUpperBound: number | null;
  };
  readonly successfulLatencyMs: {
    readonly count: number;
    readonly min: number | null;
    readonly p50: number | null;
    readonly p95: number | null;
    readonly max: number | null;
  };
  readonly failures: readonly {
    readonly fixtureId: string;
    readonly stratum: QualificationStratum;
    readonly reasons: readonly TrialFailureReason[];
  }[];
}
