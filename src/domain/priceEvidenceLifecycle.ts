export type PriceEvidenceLifecycleState = "candidate" | "fresh" | "held";

export type CandidateOutlineState = Extract<
  PriceEvidenceLifecycleState,
  "candidate"
>;

export type DetectionOutlineState = Exclude<
  PriceEvidenceLifecycleState,
  CandidateOutlineState
>;
