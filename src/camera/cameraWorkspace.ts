import type { CameraSnapshot } from "./cameraSession";
import type {
  CurrencyCode,
  SourceCurrencyCode
} from "../domain/currencies";
import type { EnteredPrice } from "../domain/manualPriceEntry";
import type { GuestRateView } from "../fx/useGuestRate";
import type {
  FocusedPriceBehavior,
  ManualEntryPromotion
} from "../member/memberPreferencesApi";
import type { RecognitionView } from "../recognition/useCameraRecognition";
import type {
  RecognitionHealthErrorFamily,
  RecognitionHealthPreferences,
  RecognitionHealthTerminalOutcome
} from "../recognitionHealth/recognitionHealth";

export type CameraWorkspaceAccessStatus =
  | "guest"
  | "loading"
  | "approved"
  | "inactive"
  | "guest-choice"
  | "unavailable";

export type CameraWorkspaceSaveStatus = "idle" | "saving" | "error";

export interface CameraWorkspaceCurrencies {
  sourceCurrency: SourceCurrencyCode;
  targetCurrencies: CurrencyCode[];
}

export interface CameraWorkspaceExperiencePreferences {
  manualEntryPromotion: ManualEntryPromotion;
  focusedPriceBehavior: FocusedPriceBehavior;
}

export type CameraWorkspaceRecognitionEvidence = Omit<
  RecognitionView,
  "focusedPrice"
>;

export type CameraWorkspaceReferenceRates = Partial<
  Record<CurrencyCode, Omit<GuestRateView, "retry">>
>;

export interface CameraWorkspaceState {
  demo: boolean;
  camera: CameraSnapshot;
  recognition: CameraWorkspaceRecognitionEvidence;
  focusedPrice: RecognitionView["focusedPrice"];
  enteredPrice: EnteredPrice | null;
  currencies: CameraWorkspaceCurrencies;
  referenceRates: CameraWorkspaceReferenceRates;
  shopperAccess: {
    status: CameraWorkspaceAccessStatus;
    saveStatus: CameraWorkspaceSaveStatus;
    isApprovedMember: boolean;
  };
  experiencePreferences: CameraWorkspaceExperiencePreferences;
  manualPriceEntry: {
    expanded: boolean;
    wasPromoted: boolean;
  };
  priceSelection: {
    enteredPriceInUse: boolean;
    focusedPriceConfirmed: boolean;
  };
  recognitionHealth: {
    preferences: RecognitionHealthPreferences;
    settingsOpen: boolean;
  };
  previewSize: { width: number; height: number };
}

export interface CameraWorkspaceActions {
  startCamera(): void;
  stopCamera(): void;
  selectPrice(
    identity: CameraWorkspaceRecognitionEvidence["detectedPrices"][number]["identity"]
  ): void;
  changeCurrencies(currencies: CameraWorkspaceCurrencies): void;
  changeExperiencePreferences(
    preferences: CameraWorkspaceExperiencePreferences
  ): void;
  enterPrice(price: EnteredPrice | null): void;
  setManualPriceEntryExpanded(expanded: boolean): void;
  useEnteredPrice(): void;
  useFocusedPrice(): void;
  retryRecognition(): void;
  retryReferenceRate(targetCurrency: CurrencyCode): void;
  leaveWorkspace(
    outcome: RecognitionHealthTerminalOutcome,
    errorFamily: RecognitionHealthErrorFamily
  ): void;
  continueAsGuest(): void;
  retryMemberAccess(): void;
  retryMemberSave(): void;
  changeRecognitionHealthSharing(enabled: boolean): void;
  openPrivacySettings(): void;
  closePrivacySettings(): void;
}

export interface CameraWorkspaceBindings {
  connectPreview(element: HTMLElement | null): void;
  connectVideo(element: HTMLVideoElement | null): void;
  connectCaptureGuide(element: HTMLDivElement | null): void;
  reportPlaybackError(): void;
}
