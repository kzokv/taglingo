import type {
  NegativeQualificationStratum,
  PositiveQualificationStratum,
  QualificationChallenge,
  QualificationStratum
} from "./qualificationTypes";

export const QUALIFICATION_POLICY = {
  positiveStrata: [
    "clean-single-price",
    "difficult-single-price",
    "complex-selection"
  ],
  negativeStrata: [
    "non-price-numerals",
    "wrong-or-unsupported-currency",
    "malformed-or-ambiguous-fragment",
    "realistic-no-price-retail"
  ],
  requiredStratumCounts: {
    "clean-single-price": 40,
    "difficult-single-price": 40,
    "complex-selection": 40,
    "non-price-numerals": 45,
    "wrong-or-unsupported-currency": 45,
    "malformed-or-ambiguous-fragment": 45,
    "realistic-no-price-retail": 44
  },
  requiredPositiveSuccesses: 108,
  requiredPositiveStratumSuccesses: 36,
  requiredNegativeSuccesses: 179,
  requiredSessions: 299,
  focusAndGeometryDeadlineMs: 5_000,
  observationWindowMs: 10_000,
  minimumGeometryIouExclusive: 0.5,
  confidenceLevel: 0.95,
  minimumScenesPerAcceptedClass: 10,
  requiredChallenges: [
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
  ]
} as const satisfies {
  readonly positiveStrata: readonly PositiveQualificationStratum[];
  readonly negativeStrata: readonly NegativeQualificationStratum[];
  readonly requiredStratumCounts: Readonly<Record<QualificationStratum, number>>;
  readonly requiredChallenges: readonly QualificationChallenge[];
  readonly [key: string]: unknown;
};

export function isPositiveStratum(
  stratum: QualificationStratum
): stratum is PositiveQualificationStratum {
  return QUALIFICATION_POLICY.positiveStrata.includes(
    stratum as PositiveQualificationStratum
  );
}
