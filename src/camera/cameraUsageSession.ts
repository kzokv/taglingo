export interface CameraUsageSession {
  observeFocusedPrice(hasFocusedPrice: boolean): Promise<boolean>;
}

export function createCameraUsageSession(
  chargeSuccessfulUsage: () => Promise<boolean>
): CameraUsageSession {
  let firstFocusObserved = false;

  return {
    async observeFocusedPrice(hasFocusedPrice) {
      if (!hasFocusedPrice || firstFocusObserved) {
        return false;
      }

      firstFocusObserved = true;
      return chargeSuccessfulUsage();
    }
  };
}
