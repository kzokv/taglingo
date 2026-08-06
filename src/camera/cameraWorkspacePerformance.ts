export const CAMERA_WORKSPACE_RESPONSIVENESS_BUDGETS = {
  truthfulStatusElapsedFromWorkspaceOpenMs: 100,
  previewElapsedFromPermissionMs: 1_000,
  warmCandidateOutlineElapsedFromPreviewP95Ms: 1_000,
  freshDetectedPriceElapsedFromPreviewP95Ms: 3_000,
  focusedPriceAndConversionElapsedFromEligibilityP95Ms: 200,
  missingRateFeedbackElapsedFromSelectionMs: 100,
  coldPreparationElapsedFromWorkspaceOpenP95Ms: 30_000,
  requiredWarmCachedTrials: 30
} as const;
