export type PriceEvidenceLifecycleState = "candidate" | "fresh" | "held";

export type CandidateOutlineState = Extract<
  PriceEvidenceLifecycleState,
  "candidate"
>;

export type DetectionOutlineState = Exclude<
  PriceEvidenceLifecycleState,
  CandidateOutlineState
>;

declare const priceEvidenceTrackIdentityBrand: unique symbol;
export type PriceEvidenceTrackIdentity = string & {
  readonly [priceEvidenceTrackIdentityBrand]: true;
};

declare const detectedPriceIdentityBrand: unique symbol;
export type DetectedPriceIdentity = PriceEvidenceTrackIdentity & {
  readonly [detectedPriceIdentityBrand]: true;
};
