import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode
} from "react";

import {
  isCameraFailureStatus,
  type CameraSnapshot,
  type CameraStatus
} from "./cameraSession";
import type {
  CameraWorkspaceActions,
  CameraWorkspaceBindings,
  CameraWorkspaceState,
  CameraWorkspaceAccessStatus,
  CameraWorkspaceSaveStatus
} from "./cameraWorkspace";
import {
  ConversionLedger,
  CurrencySettings,
  ManualPriceComposer,
  MemberStatusPanel,
  RecognitionExperienceSettings,
  RecognitionHealthPrivacy,
  TagLingoMark,
  type ExperiencePreferences
} from "./WorkspaceControls";
import {
  formatCurrencyMinorUnits,
  searchTargetCurrencies,
  SOURCE_CURRENCIES,
  type CurrencyAmount,
  type CurrencyCode,
  type SourceCurrencyCode
} from "../domain/currencies";
import {
  getManualPriceEntryGuidance,
  parseManualPriceEntry,
  type EnteredPrice
} from "../domain/manualPriceEntry";
import {
  type GuestRateViews,
  type GuestRateView
} from "../fx/useGuestRate";
import { convertWithReferenceRate } from "../fx/referenceRate";
import type {
  FocusedPriceBehavior,
  ManualEntryPromotion
} from "../member/memberPreferencesApi";
import {
  useCameraRecognition,
  type CreateRecognizer,
  type RecognitionController,
  type RecognitionView
} from "../recognition/useCameraRecognition";
import { AccessibleDetectedPriceList } from "../recognition/AccessibleDetectedPriceList";
import { CameraExperienceOverlay } from "../recognition/CameraExperience";
import { useDemoRecognition } from "../recognition/useDemoRecognition";
import { RecognitionSummary } from "../recognition/RecognitionSummary";
import type { RecognitionRuntimeConfiguration } from "../recognition/recognitionRuntime";
import type {
  RecognitionHealthErrorFamily,
  RecognitionHealthObservation,
  RecognitionHealthPreferences,
  RecognitionHealthTerminalOutcome
} from "../recognitionHealth/recognitionHealth";

type MemberAccessStatus = CameraWorkspaceAccessStatus;
type MemberSaveStatus = CameraWorkspaceSaveStatus;

const MANUAL_ENTRY_PROMOTION_DELAY_MS = 5_000;

function manualEntryPromotionDelay(
  promotion: ManualEntryPromotion
): number | null {
  switch (promotion) {
    case "after-3-seconds":
      return 3_000;
    case "after-5-seconds":
      return MANUAL_ENTRY_PROMOTION_DELAY_MS;
    case "after-10-seconds":
      return 10_000;
    case "only-on-request":
      return null;
  }
}
export const statusContent: Partial<
  Record<CameraStatus, { title: string; detail: string }>
> = {
  requesting: {
    title: "Preparing rear camera…",
    detail: "Your browser may ask for permission now."
  },
  active: {
    title: "Camera ready",
    detail:
      "The rear camera is preferred where available. Recognition stays on this device."
  },
  denied: {
    title: "Camera access was denied",
    detail:
      "Allow camera access in your browser settings, then try again—or use the no-camera demo."
  },
  unavailable: {
    title: "No camera is available",
    detail:
      "Connect or enable a camera, or continue with the deterministic demo."
  },
  interrupted: {
    title: "The camera was interrupted",
    detail: "Another app or browser state stopped the camera. Try it again."
  },
  error: {
    title: "The camera could not start",
    detail:
      "Check that no other app is using it, then retry or continue without a camera."
  }
};

function RecognitionStatusShell({
  children,
  indicatorClassName = "",
  role = "status"
}: {
  children: ReactNode;
  indicatorClassName?: string;
  role?: "alert" | "status";
}) {
  return (
    <div
      className="scan-status"
      role={role}
      aria-label="Recognition status"
    >
      <span className={`status-dot ${indicatorClassName}`.trim()} />
      <div>{children}</div>
    </div>
  );
}


function VideoPreview({
  stream,
  onReady,
  onPlaybackError
}: {
  stream: MediaStream;
  onReady: (video: HTMLVideoElement | null) => void;
  onPlaybackError: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = stream;
    let isAttached = true;
    void video.play().catch(() => {
      if (isAttached) {
        onPlaybackError();
      }
    });

    return () => {
      isAttached = false;
      onReady(null);
      video.srcObject = null;
    };
  }, [onPlaybackError, onReady, stream]);

  return (
    <video
      ref={videoRef}
      className="camera-video"
      autoPlay
      muted
      playsInline
      onLoadedMetadata={() => onReady(videoRef.current)}
      aria-label="Rear camera preview"
    />
  );
}

function PreparationStatus({
  detail,
  progress,
  sourceCurrency
}: {
  detail: string;
  progress: number;
  sourceCurrency: SourceCurrencyCode;
}) {
  return (
    <RecognitionStatusShell>
      <strong>Preparing {sourceCurrency} recognition…</strong>
      <progress
        aria-label={`Preparing ${sourceCurrency} recognition`}
        max={1}
        value={progress}
      />
      <p>{detail}</p>
    </RecognitionStatusShell>
  );
}

function StatusPanel({
  status,
  demo,
  recognition,
  sourceCurrency,
  onRetry,
  onRecognitionRetry
}: {
  status: CameraStatus;
  demo: boolean;
  recognition: RecognitionView;
  sourceCurrency: SourceCurrencyCode;
  onRetry: () => void;
  onRecognitionRetry: () => void;
}) {
  if (demo) {
    if (recognition.phase === "preparing") {
      return (
        <PreparationStatus
          detail="Loading pinned on-device language assets from TagLingo."
          progress={recognition.progress}
          sourceCurrency={sourceCurrency}
        />
      );
    }

    return (
      <RecognitionStatusShell indicatorClassName="demo-dot">
        <strong>
          {recognition.focusedPrice
            ? "Recorded observation stabilized"
            : "Checking the recorded observation…"}
        </strong>
        <p>No camera was requested and no physical-device claim is made.</p>
      </RecognitionStatusShell>
    );
  }

  if (recognition.phase === "preparing") {
    return (
      <PreparationStatus
        detail="The camera stays local while the pinned model is prepared."
        progress={recognition.progress}
        sourceCurrency={sourceCurrency}
      />
    );
  }

  if (recognition.phase === "error") {
    return (
      <RecognitionStatusShell role="alert">
        <strong>Recognition could not start</strong>
        <p>
          Try preparing the local model again. Manual Price Entry is ready
          below.
        </p>
        <div className="status-actions">
          <button
            className="text-button"
            type="button"
            onClick={onRecognitionRetry}
          >
            Try recognition again
          </button>
        </div>
      </RecognitionStatusShell>
    );
  }

  const content = statusContent[status];
  if (!content) {
    return (
      <RecognitionStatusShell>
        <strong>Camera paused</strong>
        <p>Restart when you are ready to continue.</p>
        <button className="text-button" type="button" onClick={onRetry}>
          Resume camera
        </button>
      </RecognitionStatusShell>
    );
  }

  const isFailure = isCameraFailureStatus(status);
  return (
    <RecognitionStatusShell
      role={isFailure ? "alert" : "status"}
      indicatorClassName={status === "active" ? "active-dot" : ""}
    >
      <strong>{content.title}</strong>
      <p>{content.detail}</p>
      {isFailure ? (
        <button className="text-button" type="button" onClick={onRetry}>
          Try camera again
        </button>
      ) : null}
    </RecognitionStatusShell>
  );
}

function recognitionHealthResultForWorkspaceExit({
  cameraStatus,
  recognition,
  enteredPriceInUse,
  enteredPrice,
  manualEntryWasPromoted
}: {
  cameraStatus: CameraStatus;
  recognition: RecognitionView;
  enteredPriceInUse: boolean;
  enteredPrice: EnteredPrice | null;
  manualEntryWasPromoted: boolean;
}): {
  outcome: RecognitionHealthTerminalOutcome;
  errorFamily: RecognitionHealthErrorFamily;
} {
  if (cameraStatus === "denied") {
    return {
      outcome: "camera-permission-denied",
      errorFamily: "camera-permission"
    };
  }
  if (cameraStatus === "unavailable") {
    return {
      outcome: "camera-unavailable-or-interrupted",
      errorFamily: "camera-unavailable"
    };
  }
  if (cameraStatus === "interrupted" || cameraStatus === "error") {
    return {
      outcome: "camera-unavailable-or-interrupted",
      errorFamily: "camera-interrupted"
    };
  }
  if (recognition.phase === "error") {
    return recognition.completedPassCount === 0
      ? {
          outcome: "recognition-initialization-failed",
          errorFamily: "recognition-initialization"
        }
      : {
          outcome: "unexpected-recognition-failure",
          errorFamily: "recognition-runtime"
        };
  }
  if (enteredPriceInUse && enteredPrice) {
    return {
      outcome: manualEntryWasPromoted
        ? "entered-price-after-promotion"
        : "entered-price-before-promotion",
      errorFamily: "none"
    };
  }
  if (recognition.focusedPrice) {
    return { outcome: "focused-price-obtained", errorFamily: "none" };
  }
  return {
    outcome:
      recognition.completedPassCount > 0
        ? "recognition-ended-without-stable-price"
        : "closed-without-price",
    errorFamily: "none"
  };
}

export function CameraWorkspace({
  state,
  actions,
  bindings
}: {
  state: CameraWorkspaceState;
  actions: CameraWorkspaceActions;
  bindings: CameraWorkspaceBindings;
}) {
  const preferences: ExperiencePreferences = {
    ...state.currencies,
    ...state.experiencePreferences
  };
  const recognition = {
    ...state.recognition,
    focusedPrice: state.focusedPrice,
    completedPassCount: 0,
    missCount: 0,
    focusChangeCount: 0,
    stableDetectionCount: 0,
    selectDetectedPrice: actions.selectPrice
  } satisfies RecognitionController;
  const referenceRates: GuestRateViews = Object.fromEntries(
    Object.entries(state.referenceRates).map(([currency, rate]) => [
      currency,
      rate
        ? {
            ...rate,
            retry: () =>
              actions.retryReferenceRate(currency as CurrencyCode)
          }
        : rate
    ])
  );
  const enteredPriceLabel = state.enteredPrice
    ? `${state.enteredPrice.currency} ${state.enteredPrice.displayAmount}`
    : null;
  const focusedPriceLabel = state.focusedPrice
    ? `${state.focusedPrice.currency} ${formatCurrencyMinorUnits(
        state.focusedPrice.minorUnits,
        state.focusedPrice.currency
      )}`
    : null;
  const priceInUse = (() => {
    if (state.priceSelection.enteredPriceInUse && state.enteredPrice) {
      return {
        price: state.enteredPrice,
        title: "Entered Price in use",
        detail: "Entered manually · not camera-derived",
        switchLabel: state.focusedPrice
          ? `Use Focused Price · ${focusedPriceLabel}`
          : null,
        onSwitch: actions.useFocusedPrice
      };
    }
    if (state.focusedPrice && state.priceSelection.focusedPriceConfirmed) {
      return {
        price: state.focusedPrice,
        title: "Focused Price in use",
        detail: "Camera-derived evidence",
        switchLabel: state.enteredPrice
          ? `Use Entered Price · ${enteredPriceLabel}`
          : null,
        onSwitch: actions.useEnteredPrice
      };
    }
    if (state.focusedPrice) {
      return {
        price: null,
        title: "Focused Price waiting for confirmation",
        detail: "Confirm this camera-derived price before conversion.",
        switchLabel: `Confirm Focused Price · ${focusedPriceLabel}`,
        onSwitch: actions.useFocusedPrice
      };
    }
    return {
      price: null,
      title: "Waiting for a Focused Price",
      detail: "Manual Price Entry remains available.",
      switchLabel: state.enteredPrice
        ? `Use Entered Price · ${enteredPriceLabel}`
        : null,
      onSwitch: actions.useEnteredPrice
    };
  })();

  const closeWorkspace = () => {
    actions.stopCamera();
    actions.leaveWorkspace();
  };

  return (
    <main className="camera-shell" aria-label="Camera Workspace">
      <header className="camera-header">
        <TagLingoMark />
        <div className="camera-header-actions">
          <button
            className="camera-privacy-button"
            type="button"
            onClick={actions.openPrivacySettings}
          >
            Privacy settings
          </button>
          <button
            className="close-button"
            type="button"
            onClick={closeWorkspace}
          >
            <span aria-hidden="true">×</span> Close camera
          </button>
        </div>
      </header>

      <section
        ref={bindings.connectPreview}
        className="preview"
        aria-label="Price camera"
      >
        {state.camera.stream ? (
          <VideoPreview
            stream={state.camera.stream}
            onReady={bindings.connectVideo}
            onPlaybackError={bindings.reportPlaybackError}
          />
        ) : null}
        <div
          className={`preview-fallback ${state.demo ? "demo-preview" : ""}`}
        />
        <div
          className="workspace-currency-controls"
          role="group"
          aria-label="Source and Target Currencies"
        >
          <CurrencySettings
            preferences={preferences}
            onChange={({ sourceCurrency, targetCurrencies }) =>
              actions.changeCurrencies({ sourceCurrency, targetCurrencies })
            }
            isApprovedMember={state.shopperAccess.isApprovedMember}
            memberAccessStatus={state.shopperAccess.status}
            compact
            sourceCurrencyDisabled={!state.demo}
          />
        </div>
        <CameraExperienceOverlay
          demo={state.demo}
          recognition={recognition}
          onCaptureGuideReady={bindings.connectCaptureGuide}
        />
        <div className="workspace-preview-controls">
          <div className="workspace-recognition-controls">
            <StatusPanel
              status={state.camera.status}
              demo={state.demo}
              recognition={recognition}
              sourceCurrency={state.currencies.sourceCurrency}
              onRetry={actions.startCamera}
              onRecognitionRetry={actions.retryRecognition}
            />
            <RecognitionSummary recognition={recognition} demo={state.demo} />
            <AccessibleDetectedPriceList
              detectedPrices={recognition.detectedPrices}
              focusedPrice={recognition.focusedPrice}
            explicitlyFocusedPriceIdentity={
              recognition.explicitlyFocusedPriceIdentity
            }
            previewSize={state.previewSize}
            onSelect={actions.selectPrice}
            />
          </div>
          <section
            className="workspace-conversion-controls"
            aria-label="Focused Price conversion"
          >
            <section
              className="conversion-price-source"
              role="status"
              aria-label="Price used for conversion"
            >
              <div>
                <strong>{priceInUse.title}</strong>
                <p>{priceInUse.detail}</p>
              </div>
              {priceInUse.switchLabel ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={priceInUse.onSwitch}
                >
                  {priceInUse.switchLabel}
                </button>
              ) : null}
            </section>
            <ConversionLedger
              price={priceInUse.price}
              sourceCurrency={state.currencies.sourceCurrency}
              targetCurrencies={state.currencies.targetCurrencies}
              isApprovedMember={state.shopperAccess.isApprovedMember}
              rates={referenceRates}
              onContinueAsGuest={actions.continueAsGuest}
              collapsibleReferenceRateDetails
            />
          </section>
        </div>
        <div className="privacy-chip">
          <span aria-hidden="true">●</span> Local preview
        </div>
      </section>

      <section className="result-sheet">
        <div className="sheet-handle" aria-hidden="true" />
        <ManualPriceComposer
          sourceCurrency={state.currencies.sourceCurrency}
          enteredPrice={state.enteredPrice}
          expanded={state.manualPriceEntry.expanded}
          compact
          onEnteredPriceChange={actions.enterPrice}
          onExpandedChange={actions.setManualPriceEntryExpanded}
        />
      </section>

      <aside
        className="workspace-details"
        aria-label="Workspace details"
      >
        <RecognitionHealthPrivacy
          preferences={state.recognitionHealth.preferences}
          invitation={false}
          settingsOpen={state.recognitionHealth.settingsOpen}
          onChange={actions.changeRecognitionHealthSharing}
          onDismissInvitation={() => undefined}
          onCloseSettings={actions.closePrivacySettings}
        />
        {state.shopperAccess.isApprovedMember ? (
          <RecognitionExperienceSettings
            preferences={preferences}
            onChange={({ manualEntryPromotion, focusedPriceBehavior }) =>
              actions.changeExperiencePreferences({
                manualEntryPromotion,
                focusedPriceBehavior
              })
            }
            compact
          />
        ) : null}
        <MemberStatusPanel
          accessStatus={
            state.shopperAccess.usingGuestMode
              ? "guest-choice"
              : state.shopperAccess.status
          }
          saveStatus={state.shopperAccess.saveStatus}
          onRetryAccess={actions.retryMemberAccess}
          onRetrySave={actions.retryMemberSave}
        />
      </aside>
    </main>
  );
}

export function LiveCameraWorkspace({
  demo,
  snapshot,
  preferences,
  isApprovedMember,
  usingGuestMode,
  memberAccessStatus,
  rates,
  onPreferencesChange,
  recognitionRuntime,
  createRecognizer,
  onStop,
  onClose,
  onRetry,
  onPlaybackError,
  memberSaveStatus,
  onRetryMemberAccess,
  onRetryMemberSave,
  onContinueAsGuest,
  onRecognitionHealthRecord,
  recognitionHealthPreferences,
  privacySettingsOpen,
  onRecognitionHealthChange,
  onOpenPrivacySettings,
  onClosePrivacySettings,
  onFocusedPrice,
  confirmationContextKey
}: {
  demo: boolean;
  snapshot: CameraSnapshot;
  preferences: ExperiencePreferences;
  isApprovedMember: boolean;
  usingGuestMode: boolean;
  memberAccessStatus: MemberAccessStatus;
  rates: GuestRateViews;
  onPreferencesChange: (preferences: ExperiencePreferences) => void;
  recognitionRuntime: RecognitionRuntimeConfiguration;
  createRecognizer: CreateRecognizer;
  onStop: () => void;
  onClose: (
    outcome: RecognitionHealthTerminalOutcome,
    errorFamily: RecognitionHealthErrorFamily
  ) => void;
  onRetry: () => void;
  onPlaybackError: () => void;
  memberSaveStatus: MemberSaveStatus;
  onRetryMemberAccess: () => void;
  onRetryMemberSave: () => void;
  onContinueAsGuest: () => void;
  onRecognitionHealthRecord: (
    observation: RecognitionHealthObservation
  ) => void;
  recognitionHealthPreferences: RecognitionHealthPreferences;
  privacySettingsOpen: boolean;
  onRecognitionHealthChange: (enabled: boolean) => void;
  onOpenPrivacySettings: () => void;
  onClosePrivacySettings: () => void;
  onFocusedPrice: () => void;
  confirmationContextKey: string;
}) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [preview, setPreview] = useState<HTMLElement | null>(null);
  const [captureGuide, setCaptureGuide] = useState<HTMLElement | null>(null);
  const [recognitionRestartKey, setRecognitionRestartKey] = useState(0);
  const [enteredPrice, setEnteredPrice] = useState<EnteredPrice | null>(null);
  const [manualEntryExpanded, setManualEntryExpanded] = useState(false);
  const [enteredPriceInUse, setEnteredPriceInUse] = useState(false);
  const [confirmedFocusedPriceOccurrence, setConfirmedFocusedPriceOccurrence] =
    useState<{
      confirmationContextKey: string;
      recognitionRestartKey: number;
      focusChangeCount: number;
      focusedPriceIdentity: string;
      occurrenceRevision: number;
    } | null>(null);
  const [focusOccurrenceRevision, setFocusOccurrenceRevision] = useState(0);
  const manualPromotionHandledRef = useRef(false);
  const manualEntryPromotedRef = useRef(false);
  const demoRecognition = useDemoRecognition(
    demo && preferences.sourceCurrency === "JPY"
  );
  const cameraRecognition = useCameraRecognition({
    enabled: !demo && snapshot.status === "active",
    runtime: recognitionRuntime,
    sourceCurrency: preferences.sourceCurrency,
    video,
    preview,
    captureGuide,
    createRecognizer,
    recognitionRestartKey
  });
  const recognition = demo ? demoRecognition : cameraRecognition;
  const currentFocusedPriceIdentity = recognition.focusedPrice?.identity ?? null;
  const focusTransitionKey = `${confirmationContextKey}:${recognitionRestartKey}:${recognition.focusChangeCount}:${currentFocusedPriceIdentity ?? "none"}`;
  const previewBounds = preview?.getBoundingClientRect();
  const detectedPricePreviewSize = demo
    ? { width: 1_000, height: 1_000 }
    : {
        width: previewBounds?.width ?? 1,
        height: previewBounds?.height ?? 1
      };

  useEffect(() => {
    if (!demo && recognition.focusedPrice) {
      onFocusedPrice();
    }
  }, [demo, onFocusedPrice, recognition.focusedPrice]);

  useEffect(() => {
    setConfirmedFocusedPriceOccurrence(null);
    setFocusOccurrenceRevision((revision) => revision + 1);
  }, [focusTransitionKey]);

  useEffect(() => {
    setEnteredPrice(null);
    setManualEntryExpanded(false);
    setEnteredPriceInUse(false);
    setConfirmedFocusedPriceOccurrence(null);
    manualPromotionHandledRef.current = false;
    manualEntryPromotedRef.current = false;
  }, [preferences.sourceCurrency]);

  useEffect(() => {
    if (
      recognition.phase === "error" ||
      isCameraFailureStatus(snapshot.status)
    ) {
      if (preferences.manualEntryPromotion === "only-on-request") {
        return;
      }
      manualPromotionHandledRef.current = true;
      manualEntryPromotedRef.current = true;
      setManualEntryExpanded(true);
    }
  }, [preferences.manualEntryPromotion, recognition.phase, snapshot.status]);

  useEffect(() => {
    if (recognition.focusedPrice) {
      manualPromotionHandledRef.current = false;
      return;
    }
    if (manualEntryExpanded || manualPromotionHandledRef.current) {
      return;
    }
    const promotionDelayMs = manualEntryPromotionDelay(
      preferences.manualEntryPromotion
    );
    if (promotionDelayMs === null) {
      return;
    }
    const promotion = window.setTimeout(() => {
      manualPromotionHandledRef.current = true;
      manualEntryPromotedRef.current = true;
      setManualEntryExpanded(true);
    }, promotionDelayMs);
    return () => window.clearTimeout(promotion);
  }, [
    manualEntryExpanded,
    preferences.manualEntryPromotion,
    recognition.focusedPrice
  ]);

  useEffect(() => {
    onRecognitionHealthRecord({
      atMs: performance.now(),
      ready: ["searching", "stabilizing", "focused"].includes(
        recognition.phase
      ),
      detectedPriceCount: recognition.detectedPrices.length,
      hasFocusedPrice: recognition.focusedPrice !== null,
      recognitionPassCount: recognition.completedPassCount,
      missCount: recognition.missCount,
      focusChangeCount: recognition.focusChangeCount,
      stableDetectionCount: recognition.stableDetectionCount
    });
  }, [onRecognitionHealthRecord, recognition]);

  const updateEnteredPrice = (nextEnteredPrice: EnteredPrice | null) => {
    setEnteredPrice(nextEnteredPrice);
    setEnteredPriceInUse(Boolean(nextEnteredPrice));
  };

  const updateManualEntryExpanded = (expanded: boolean) => {
    if (!recognition.focusedPrice) {
      manualPromotionHandledRef.current = true;
    }
    setManualEntryExpanded(expanded);
  };

  const focusedPriceCanBeUsed =
    recognition.focusedPrice !== null &&
    (preferences.focusedPriceBehavior === "automatic" ||
      (confirmedFocusedPriceOccurrence?.confirmationContextKey ===
        confirmationContextKey &&
        confirmedFocusedPriceOccurrence.recognitionRestartKey ===
          recognitionRestartKey &&
        confirmedFocusedPriceOccurrence.focusChangeCount ===
          recognition.focusChangeCount &&
        confirmedFocusedPriceOccurrence.focusedPriceIdentity ===
          currentFocusedPriceIdentity &&
        confirmedFocusedPriceOccurrence.occurrenceRevision ===
          focusOccurrenceRevision));
  const useFocusedPrice = () => {
    if (!recognition.focusedPrice) {
      return;
    }
    setConfirmedFocusedPriceOccurrence({
      confirmationContextKey,
      recognitionRestartKey,
      focusChangeCount: recognition.focusChangeCount,
      focusedPriceIdentity: recognition.focusedPrice.identity,
      occurrenceRevision: focusOccurrenceRevision
    });
    setEnteredPriceInUse(false);
  };
  const recognitionEvidence = {
    phase: recognition.phase,
    progress: recognition.progress,
    candidateOutlines: recognition.candidateOutlines,
    detectedPrices: recognition.detectedPrices,
    explicitlyFocusedPriceIdentity:
      recognition.explicitlyFocusedPriceIdentity
  };
  const workspaceReferenceRates = Object.fromEntries(
    Object.entries(rates).map(([currency, rate]) => {
      if (!rate || rate.phase === "loading") {
        return [currency, rate];
      }
      if (rate.phase === "ready") {
        return [
          currency,
          { phase: rate.phase, rate: rate.rate, error: rate.error }
        ];
      }
      return [
        currency,
        {
          phase: rate.phase,
          rate: rate.rate,
          error: rate.error,
          reason: rate.reason
        }
      ];
    })
  );
  const leaveWorkspace = () => {
    const result = recognitionHealthResultForWorkspaceExit({
      cameraStatus: snapshot.status,
      recognition,
      enteredPriceInUse,
      enteredPrice,
      manualEntryWasPromoted: manualEntryPromotedRef.current
    });
    onClose(result.outcome, result.errorFamily);
  };

  return (
    <CameraWorkspace
      state={{
        demo,
        camera: snapshot,
        recognition: recognitionEvidence,
        focusedPrice: recognition.focusedPrice,
        enteredPrice,
        currencies: {
          sourceCurrency: preferences.sourceCurrency,
          targetCurrencies: preferences.targetCurrencies
        },
        referenceRates: workspaceReferenceRates,
        shopperAccess: {
          status: memberAccessStatus,
          saveStatus: memberSaveStatus,
          isApprovedMember,
          usingGuestMode
        },
        experiencePreferences: {
          manualEntryPromotion: preferences.manualEntryPromotion,
          focusedPriceBehavior: preferences.focusedPriceBehavior
        },
        manualPriceEntry: {
          expanded: manualEntryExpanded,
          wasPromoted: manualEntryPromotedRef.current
        },
        priceSelection: {
          enteredPriceInUse,
          focusedPriceConfirmed: focusedPriceCanBeUsed
        },
        recognitionHealth: {
          preferences: recognitionHealthPreferences,
          settingsOpen: privacySettingsOpen
        },
        previewSize: detectedPricePreviewSize
      }}
      actions={{
        startCamera: onRetry,
        stopCamera: onStop,
        selectPrice: recognition.selectDetectedPrice,
        changeCurrencies: ({ sourceCurrency, targetCurrencies }) =>
          onPreferencesChange({
            ...preferences,
            sourceCurrency,
            targetCurrencies
          }),
        changeExperiencePreferences: (experiencePreferences) =>
          onPreferencesChange({ ...preferences, ...experiencePreferences }),
        enterPrice: updateEnteredPrice,
        setManualPriceEntryExpanded: updateManualEntryExpanded,
        useEnteredPrice: () => setEnteredPriceInUse(true),
        useFocusedPrice,
        retryRecognition: () =>
          setRecognitionRestartKey((restartKey) => restartKey + 1),
        retryReferenceRate: (targetCurrency) =>
          rates[targetCurrency]?.retry(),
        leaveWorkspace,
        continueAsGuest: onContinueAsGuest,
        retryMemberAccess: onRetryMemberAccess,
        retryMemberSave: onRetryMemberSave,
        changeRecognitionHealthSharing: onRecognitionHealthChange,
        openPrivacySettings: onOpenPrivacySettings,
        closePrivacySettings: onClosePrivacySettings
      }}
      bindings={{
        connectPreview: setPreview,
        connectVideo: setVideo,
        connectCaptureGuide: setCaptureGuide,
        reportPlaybackError: onPlaybackError
      }}
    />
  );
}
