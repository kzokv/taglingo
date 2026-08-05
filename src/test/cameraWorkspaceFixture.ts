import type { CameraWorkspaceState } from "../camera/cameraWorkspace";
import type { GuestReferenceRate } from "../fx/referenceRate";

export const CAMERA_WORKSPACE_FIXTURE_PRICES = [
  {
    identity: "workspace-price-one",
    currency: "JPY" as const,
    minorUnits: 4_142,
    confidence: 96,
    box: { x: 400, y: 320, width: 160, height: 80 }
  },
  {
    identity: "workspace-price-two",
    currency: "JPY" as const,
    minorUnits: 980,
    confidence: 92,
    box: { x: 220, y: 720, width: 140, height: 72 }
  }
];

export function createCameraWorkspaceFixtureState(
  referenceRate: GuestReferenceRate,
  overrides: Partial<CameraWorkspaceState> = {}
): CameraWorkspaceState {
  return {
    demo: true,
    camera: { status: "active", stream: null },
    recognition: {
      phase: "focused",
      progress: 1,
      detectedPrices: CAMERA_WORKSPACE_FIXTURE_PRICES,
      explicitlyFocusedPriceIdentity:
        CAMERA_WORKSPACE_FIXTURE_PRICES[0].identity
    },
    focusedPrice: CAMERA_WORKSPACE_FIXTURE_PRICES[0],
    enteredPrice: null,
    currencies: { sourceCurrency: "JPY", targetCurrencies: ["USD"] },
    referenceRates: {
      USD: { phase: "ready", rate: referenceRate, error: null }
    },
    shopperAccess: {
      status: "guest",
      saveStatus: "idle",
      isApprovedMember: false,
      usingGuestMode: false
    },
    experiencePreferences: {
      manualEntryPromotion: "after-5-seconds",
      focusedPriceBehavior: "automatic"
    },
    manualPriceEntry: { expanded: true, wasPromoted: false },
    priceSelection: {
      enteredPriceInUse: false,
      focusedPriceConfirmed: true
    },
    recognitionHealth: {
      preferences: { sharingEnabled: false, invitationShown: false },
      settingsOpen: false
    },
    previewSize: { width: 1_000, height: 1_000 },
    ...overrides
  };
}
