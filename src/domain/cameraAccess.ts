import type { SourceCurrencyCode } from "./currencies";

export type ResolveCameraAccess = (context: {
  sourceCurrency: SourceCurrencyCode;
  isApprovedMember: boolean;
  guestCameraAllowanceAvailable?: boolean;
}) => boolean;

export const GUEST_CAMERA_CURRENCIES = [
  "USD",
  "AUD",
  "JPY",
  "TWD",
  "EUR"
] as const satisfies readonly SourceCurrencyCode[];

export function isGuestCameraCurrency(
  sourceCurrency: SourceCurrencyCode
): sourceCurrency is (typeof GUEST_CAMERA_CURRENCIES)[number] {
  return (GUEST_CAMERA_CURRENCIES as readonly SourceCurrencyCode[]).includes(
    sourceCurrency
  );
}

export const resolveFoundationCameraAccess: ResolveCameraAccess = ({
  sourceCurrency,
  isApprovedMember,
  guestCameraAllowanceAvailable = false
}) =>
  isApprovedMember ||
  (guestCameraAllowanceAvailable &&
    isGuestCameraCurrency(sourceCurrency));
