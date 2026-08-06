import type { CameraSnapshot } from "./cameraSession";
import type {
  CurrencyCode,
  SourceCurrencyCode
} from "../domain/currencies";
import type { EnteredPrice } from "../domain/manualPriceEntry";
import type { Rectangle } from "../domain/geometry";
import type {
  CandidateOutlineState,
  DetectedPriceIdentity,
  DetectionOutlineState,
  PriceEvidenceTrackIdentity
} from "../domain/priceEvidenceLifecycle";
import type { GuestRateView } from "../fx/useGuestRate";
import type {
  FocusedPriceBehavior,
  ManualEntryPromotion
} from "../member/memberPreferencesApi";
import type { RecognitionHealthPreferences } from "../recognitionHealth/recognitionHealth";

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

export type CameraWorkspaceRecognitionPhase =
  | "waiting"
  | "preparing"
  | "searching"
  | "stabilizing"
  | "focused"
  | "error";

export type CameraWorkspaceDetectedPriceIdentity = DetectedPriceIdentity;

export function cameraWorkspaceDetectedPriceIdentity(
  value: string
): CameraWorkspaceDetectedPriceIdentity {
  return value as CameraWorkspaceDetectedPriceIdentity;
}

export interface CameraWorkspaceDetectedPrice {
  identity: CameraWorkspaceDetectedPriceIdentity;
  currency: SourceCurrencyCode;
  minorUnits: number;
  confidence: number;
  box: Rectangle;
  state: DetectionOutlineState;
}

export interface CameraWorkspaceCandidateOutline {
  identity: PriceEvidenceTrackIdentity;
  state: CandidateOutlineState;
  label: "Possible price";
  box: Rectangle;
  expiresAtMs: number;
}

export interface CameraWorkspaceRecognitionEvidence {
  phase: CameraWorkspaceRecognitionPhase;
  progress: number;
  candidateOutlines: CameraWorkspaceCandidateOutline[];
  detectedPrices: CameraWorkspaceDetectedPrice[];
  explicitlyFocusedPriceIdentity: CameraWorkspaceDetectedPriceIdentity | null;
}

type WithoutRetry<T> = T extends unknown ? Omit<T, "retry"> : never;

export type CameraWorkspaceReferenceRates = Partial<
  Record<CurrencyCode, WithoutRetry<GuestRateView>>
>;

export interface CameraWorkspaceState {
  demo: boolean;
  camera: CameraSnapshot;
  recognition: CameraWorkspaceRecognitionEvidence;
  focusedPrice: CameraWorkspaceDetectedPrice | null;
  enteredPrice: EnteredPrice | null;
  currencies: CameraWorkspaceCurrencies;
  referenceRates: CameraWorkspaceReferenceRates;
  shopperAccess: {
    status: CameraWorkspaceAccessStatus;
    saveStatus: CameraWorkspaceSaveStatus;
    isApprovedMember: boolean;
    usingGuestMode: boolean;
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
  selectPrice(identity: CameraWorkspaceDetectedPriceIdentity): void;
  resumeAutomaticFocus(): void;
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
  leaveWorkspace(): void;
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
