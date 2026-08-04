import type { SourceCurrencyCode } from "./currencies";

export type ResolveCameraAccess = (context: {
  sourceCurrency: SourceCurrencyCode;
  isApprovedMember: boolean;
}) => boolean;

// Issue #81 extends this policy port with the Guest Camera Currency and
// rolling-allowance rules. Until then, universal runtime access is available
// only after the existing active-membership check succeeds.
export const resolveFoundationCameraAccess: ResolveCameraAccess = ({
  isApprovedMember
}) => isApprovedMember;
