import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
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
  CameraWorkspaceSaveStatus,
  CameraWorkspaceDetectedPriceIdentity
} from "./cameraWorkspace";
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
import type { DetectedPriceIdentity } from "../recognition/focusTracker";
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

export interface ExperiencePreferences {
  sourceCurrency: SourceCurrencyCode;
  targetCurrencies: CurrencyCode[];
  manualEntryPromotion: ManualEntryPromotion;
  focusedPriceBehavior: FocusedPriceBehavior;
}

type MemberAccessStatus = CameraWorkspaceAccessStatus;
type MemberSaveStatus = CameraWorkspaceSaveStatus;
export const CHECKING_MEMBER_ACCESS_LABEL = "Checking member access";
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


export function TagLingoMark() {
  return (
    <div className="brand" aria-label="TagLingo">
      <span className="brand-mark" aria-hidden="true">
        TL
      </span>
      <span>TagLingo</span>
    </div>
  );
}

export function CurrencySettings({
  preferences,
  onChange,
  isApprovedMember,
  memberAccessStatus = isApprovedMember ? "approved" : "guest",
  compact = false,
  sourceCurrencyDisabled = false
}: {
  preferences: ExperiencePreferences;
  onChange: (preferences: ExperiencePreferences) => void;
  isApprovedMember: boolean;
  memberAccessStatus?: MemberAccessStatus;
  compact?: boolean;
  sourceCurrencyDisabled?: boolean;
}) {
  const [isTargetPickerOpen, setIsTargetPickerOpen] = useState(false);
  const [targetQuery, setTargetQuery] = useState("");
  const targetPickerRef = useRef<HTMLDivElement>(null);
  const targetTriggerRef = useRef<HTMLButtonElement>(null);
  const targetListId = useId();
  const matches = searchTargetCurrencies(targetQuery).filter(
    ({ code }) => code !== preferences.sourceCurrency
  );
  const maxTargets = isApprovedMember ? 3 : 1;
  const accessLabel = isApprovedMember
    ? "Approved Member · up to 3"
    : memberAccessStatus === "loading"
      ? CHECKING_MEMBER_ACCESS_LABEL
      : memberAccessStatus === "unavailable"
        ? "Signed in · access unavailable"
        : memberAccessStatus === "inactive"
          ? "Signed in · Guest limits"
          : memberAccessStatus === "guest-choice"
            ? "Signed in · Guest limits"
            : "Guest · 1";

  useEffect(() => {
    if (!isTargetPickerOpen) {
      return undefined;
    }
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!targetPickerRef.current?.contains(event.target as Node)) {
        setIsTargetPickerOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsTargetPickerOpen(false);
        targetTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isTargetPickerOpen]);

  const updateSource = (event: ChangeEvent<HTMLSelectElement>) => {
    const sourceCurrency = event.target.value as SourceCurrencyCode;
    const targetCurrencies = preferences.targetCurrencies.map((target) =>
      target === sourceCurrency ? preferences.sourceCurrency : target
    );
    onChange({ ...preferences, sourceCurrency, targetCurrencies });
  };
  const toggleTarget = (target: CurrencyCode) => {
    const isSelected = preferences.targetCurrencies.includes(target);
    if (isSelected) {
      if (preferences.targetCurrencies.length === 1) {
        return;
      }
      onChange({
        ...preferences,
        targetCurrencies: preferences.targetCurrencies.filter(
          (selected) => selected !== target
        )
      });
      return;
    }
    onChange({
      ...preferences,
      targetCurrencies:
        maxTargets === 1
          ? [target]
          : [...preferences.targetCurrencies, target]
    });
  };

  return (
    <div className={compact ? "currency-grid compact" : "currency-grid"}>
      <label className="field">
        <span>Source Currency</span>
        <select
          name={compact ? "cameraSourceCurrency" : "sourceCurrency"}
          value={preferences.sourceCurrency}
          disabled={sourceCurrencyDisabled}
          onChange={updateSource}
        >
          {SOURCE_CURRENCIES.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.name}
            </option>
          ))}
        </select>
      </label>

      <div className="target-currency-picker field" ref={targetPickerRef}>
        <span>
          Target Currency <em>{accessLabel}</em>
        </span>
        <button
          ref={targetTriggerRef}
          className="target-currency-trigger"
          type="button"
          aria-label={`Target Currencies: ${preferences.targetCurrencies.length} selected · ${preferences.targetCurrencies.join(" · ")}`}
          aria-haspopup="listbox"
          aria-expanded={isTargetPickerOpen}
          aria-controls={isTargetPickerOpen ? targetListId : undefined}
          onClick={() => setIsTargetPickerOpen((open) => !open)}
        >
          <strong>{preferences.targetCurrencies.length} selected</strong>
          <small>{preferences.targetCurrencies.join(" · ")}</small>
          <span aria-hidden="true">⌄</span>
        </button>
        {isTargetPickerOpen ? (
          <div className="target-currency-popover">
            <div className="target-currency-heading">
              <div>
                <strong>Choose Target Currencies</strong>
                <span>
                  {preferences.targetCurrencies.length} of {maxTargets} selected
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsTargetPickerOpen(false);
                  targetTriggerRef.current?.focus();
                }}
              >
                Done
              </button>
            </div>
            <label className="target-currency-search">
              <span className="visually-hidden">Search Target Currencies</span>
              <input
                name={compact ? "cameraTargetCurrencySearch" : "targetCurrencySearch"}
                type="search"
                value={targetQuery}
                onChange={(event) => setTargetQuery(event.target.value)}
                placeholder="Search code, currency, or alias"
                autoComplete="off"
                autoFocus
              />
            </label>
            <div
              id={targetListId}
              className="target-currency-list"
              role="listbox"
              aria-label="Target Currencies"
              aria-multiselectable={isApprovedMember}
            >
              {matches.map((currency) => {
                const isSelected = preferences.targetCurrencies.includes(
                  currency.code
                );
                const isDisabled =
                  (isSelected && preferences.targetCurrencies.length === 1) ||
                  (!isSelected &&
                    maxTargets > 1 &&
                    preferences.targetCurrencies.length >= maxTargets);
                return (
                  <button
                    key={currency.code}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={isDisabled}
                    disabled={isDisabled}
                    onClick={() => toggleTarget(currency.code)}
                  >
                    <span className="target-currency-name">
                      <strong>{currency.code}</strong>
                      <small>{currency.name}</small>
                    </span>
                    <span className="target-currency-check" aria-hidden="true">
                      {isSelected ? "✓" : "+"}
                    </span>
                  </button>
                );
              })}
              {matches.length === 0 ? (
                <p className="target-currency-empty">No matching currency</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RecognitionExperienceSettings({
  preferences,
  onChange,
  compact = false
}: {
  preferences: ExperiencePreferences;
  onChange: (preferences: ExperiencePreferences) => void;
  compact?: boolean;
}) {
  return (
    <section
      className={`recognition-experience-settings ${compact ? "compact" : ""}`}
      aria-label="Recognition Experience Settings"
    >
      <div>
        <strong>Recognition Experience Settings</strong>
        <p>These choices synchronize across your Approved Member devices.</p>
      </div>
      <div className="recognition-experience-fields">
        <label className="field">
          <span>Show Manual Price Entry</span>
          <select
            name={compact ? "cameraManualEntryPromotion" : "manualEntryPromotion"}
            value={preferences.manualEntryPromotion}
            onChange={(event) =>
              onChange({
                ...preferences,
                manualEntryPromotion: event.target.value as ManualEntryPromotion
              })
            }
          >
            <option value="after-3-seconds">After 3 seconds</option>
            <option value="after-5-seconds">After 5 seconds</option>
            <option value="after-10-seconds">After 10 seconds</option>
            <option value="only-on-request">Only when I ask</option>
          </select>
        </label>
        <label className="field">
          <span>When a Focused Price appears</span>
          <select
            name={compact ? "cameraFocusedPriceBehavior" : "focusedPriceBehavior"}
            value={preferences.focusedPriceBehavior}
            onChange={(event) =>
              onChange({
                ...preferences,
                focusedPriceBehavior: event.target.value as FocusedPriceBehavior
              })
            }
          >
            <option value="automatic">Convert automatically</option>
            <option value="confirm">Ask before using it</option>
          </select>
        </label>
      </div>
      <p className="fixed-recognition-rules">
        Recognition rules stay fixed. Confidence, evidence, notation, geometry,
        preprocessing, and stability are not shopper-editable.
      </p>
    </section>
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
    <div className="scan-status" role="status">
      <span className="status-dot" />
      <div>
        <strong>Preparing {sourceCurrency} recognition…</strong>
        <progress
          aria-label={`Preparing ${sourceCurrency} recognition`}
          max={1}
          value={progress}
        />
        <p>{detail}</p>
      </div>
    </div>
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
      <div className="scan-status" role="status">
        <span className="status-dot demo-dot" />
        <div>
          <strong>
            {recognition.focusedPrice
              ? "Recorded observation stabilized"
              : "Checking the recorded observation…"}
          </strong>
          <p>No camera was requested and no physical-device claim is made.</p>
        </div>
      </div>
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
      <div className="scan-status" role="alert">
        <span className="status-dot" />
        <div>
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
        </div>
      </div>
    );
  }

  const content = statusContent[status];
  if (!content) {
    return (
      <div className="scan-status" role="status">
        <span className="status-dot" />
        <div>
          <strong>Camera paused</strong>
          <p>Restart when you are ready to continue.</p>
          <button className="text-button" type="button" onClick={onRetry}>
            Resume camera
          </button>
        </div>
      </div>
    );
  }

  const isFailure = isCameraFailureStatus(status);
  return (
    <div className="scan-status" role={isFailure ? "alert" : "status"}>
      <span
        className={`status-dot ${status === "active" ? "active-dot" : ""}`}
      />
      <div>
        <strong>{content.title}</strong>
        <p>{content.detail}</p>
        {isFailure ? (
          <button className="text-button" type="button" onClick={onRetry}>
            Try camera again
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ManualPriceComposer({
  sourceCurrency,
  enteredPrice,
  expanded,
  compact = false,
  onEnteredPriceChange,
  onExpandedChange
}: {
  sourceCurrency: SourceCurrencyCode;
  enteredPrice: EnteredPrice | null;
  expanded: boolean;
  compact?: boolean;
  onEnteredPriceChange: (enteredPrice: EnteredPrice | null) => void;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const composerContentId = useId();
  const amountInputId = useId();
  const enteredPriceHeadingId = useId();
  const amountHelpId = useId();
  const entryGuidance = getManualPriceEntryGuidance(sourceCurrency);

  useEffect(() => {
    setAmount("");
    setError(null);
  }, [sourceCurrency]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = parseManualPriceEntry(sourceCurrency, amount);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    onEnteredPriceChange(result.enteredPrice);
  };

  const reset = () => {
    setAmount("");
    setError(null);
    onEnteredPriceChange(null);
  };

  return (
    <section
      className={`manual-price-composer ${compact ? "compact-composer" : ""}`}
      aria-label="Manual Price Entry"
    >
      {onExpandedChange ? (
        <button
          className="manual-composer-toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls={composerContentId}
          aria-label={`${expanded ? "Close" : "Open"} Manual Price Entry`}
          onClick={() => onExpandedChange(!expanded)}
        >
          <span aria-hidden="true">✎</span>
          <span>
            <strong>Manual Price Entry</strong>
            <small>
              {enteredPrice
                ? `Entered Price · ${enteredPrice.currency} ${enteredPrice.displayAmount}`
                : `${sourceCurrency} · Available anytime`}
            </small>
          </span>
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </button>
      ) : null}

      {expanded ? (
        <div id={composerContentId} className="manual-composer-content">
          <form className="manual-entry-form" onSubmit={submit}>
            <label htmlFor={amountInputId}>
              <span>{sourceCurrency} amount</span>
            </label>
            <div
              className={
                error ? "manual-amount-field has-error" : "manual-amount-field"
              }
            >
              <span aria-hidden="true">{sourceCurrency}</span>
              <input
                id={amountInputId}
                name="manualPriceAmount"
                inputMode="decimal"
                autoComplete="off"
                maxLength={32}
                value={amount}
                aria-describedby={amountHelpId}
                aria-invalid={Boolean(error)}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={entryGuidance.placeholder}
              />
            </div>
            <p
              id={amountHelpId}
              className={error ? "manual-entry-help error" : "manual-entry-help"}
            >
              {error ?? entryGuidance.message}
            </p>
            <button className="primary-button" type="submit">
              Convert Entered Price <span aria-hidden="true">→</span>
            </button>
          </form>

          {enteredPrice ? (
            <section
              className="entered-price-card"
              role="region"
              aria-labelledby={enteredPriceHeadingId}
            >
              <div>
                <span aria-hidden="true">✎</span>
                <div>
                  <h2 id={enteredPriceHeadingId}>Entered Price</h2>
                  <p>Entered manually · not camera-derived</p>
                </div>
              </div>
              <strong>
                {enteredPrice.currency} {enteredPrice.displayAmount}
              </strong>
              <button className="text-button" type="button" onClick={reset}>
                Enter another price
              </button>
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
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
    detectedPrices: state.recognition.detectedPrices.map((price) => ({
      ...price,
      identity: price.identity as unknown as DetectedPriceIdentity
    })),
    focusedPrice: state.focusedPrice
      ? {
          ...state.focusedPrice,
          identity: state.focusedPrice.identity as unknown as DetectedPriceIdentity
        }
      : null,
    explicitlyFocusedPriceIdentity: state.recognition
      .explicitlyFocusedPriceIdentity as unknown as
        | DetectedPriceIdentity
        | null,
    completedPassCount: 0,
    missCount: 0,
    focusChangeCount: 0,
    stableDetectionCount: 0,
    selectDetectedPrice: (identity: DetectedPriceIdentity) =>
      actions.selectPrice(
        identity as unknown as CameraWorkspaceDetectedPriceIdentity
      )
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
    <main className="camera-shell">
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
        <CameraExperienceOverlay
          demo={state.demo}
          recognition={recognition}
          onCaptureGuideReady={bindings.connectCaptureGuide}
        />
        <div className="privacy-chip">
          <span aria-hidden="true">●</span> Local preview
        </div>
      </section>

      <section className="result-sheet" aria-label="Camera controls and status">
        <div className="sheet-handle" aria-hidden="true" />
        <RecognitionHealthPrivacy
          preferences={state.recognitionHealth.preferences}
          invitation={false}
          settingsOpen={state.recognitionHealth.settingsOpen}
          onChange={actions.changeRecognitionHealthSharing}
          onDismissInvitation={() => undefined}
          onCloseSettings={actions.closePrivacySettings}
        />
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
          onSelect={(identity) =>
            actions.selectPrice(
              identity as unknown as CameraWorkspaceDetectedPriceIdentity
            )
          }
        />
        <ManualPriceComposer
          sourceCurrency={state.currencies.sourceCurrency}
          enteredPrice={state.enteredPrice}
          expanded={state.manualPriceEntry.expanded}
          compact
          onEnteredPriceChange={actions.enterPrice}
          onExpandedChange={actions.setManualPriceEntryExpanded}
        />
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
        />
      </section>
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
    detectedPrices: recognition.detectedPrices.map((price) => ({
      ...price,
      identity:
        price.identity as unknown as CameraWorkspaceDetectedPriceIdentity
    })),
    explicitlyFocusedPriceIdentity:
      recognition.explicitlyFocusedPriceIdentity as unknown as
        | CameraWorkspaceDetectedPriceIdentity
        | null
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
        focusedPrice: recognition.focusedPrice
          ? {
              ...recognition.focusedPrice,
              identity: recognition.focusedPrice.identity as unknown as
                CameraWorkspaceDetectedPriceIdentity
            }
          : null,
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
        selectPrice: (identity) =>
          recognition.selectDetectedPrice(
            identity as unknown as DetectedPriceIdentity
          ),
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

function ConversionRow({
  price,
  sourceCurrency,
  targetCurrency,
  guestRate,
  emptyMessage
}: {
  price: CurrencyAmount | null;
  sourceCurrency: CurrencyCode;
  targetCurrency: CurrencyCode;
  guestRate: GuestRateView;
  emptyMessage: string;
}) {
  if (guestRate.phase === "loading") {
    return (
      <div className="conversion-card" role="status">
        <strong>Loading Reference Rate…</strong>
      </div>
    );
  }
  if (guestRate.phase === "error") {
    const retryLabel =
      guestRate.reason === "quota"
        ? "Try Reference Rate again"
        : guestRate.reason === "unauthenticated"
          ? "Retry after sign in"
          : guestRate.reason === "unauthorized"
            ? "Try authorized Reference Rate again"
            : "Reconnect and retry";
    return (
      <div className="conversion-card conversion-error" role="alert">
        <strong>Conversion unavailable</strong>
        <p>{guestRate.error}</p>
        <button className="text-button" type="button" onClick={guestRate.retry}>
          {retryLabel}
        </button>
      </div>
    );
  }
  if (
    price === null ||
    price.currency !== sourceCurrency
  ) {
    return (
      <div className="conversion-card" role="status">
        <strong>Reference Rate ready</strong>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const convertedMinorUnits = convertWithReferenceRate(
    price,
    guestRate.rate
  );
  const formatted = formatCurrencyMinorUnits(
    convertedMinorUnits,
    targetCurrency
  );

  return (
    <section
      className="conversion-card"
      aria-label={`${targetCurrency} conversion`}
    >
      <div className="conversion-heading">
        <span>Target Currency</span>
        <strong>
          {targetCurrency} {formatted}
        </strong>
      </div>
      <dl>
        <div>
          <dt>Reference Rate</dt>
          <dd>
            1 {sourceCurrency} = {guestRate.rate.value} {targetCurrency}
          </dd>
        </div>
        <div>
          <dt>Effective date</dt>
          <dd>Effective {guestRate.rate.providerPublishedDate}</dd>
        </div>
      </dl>
      <p className="rate-attribution">{guestRate.rate.attribution}</p>
      {guestRate.rate.state === "offline" ? (
        <p className="offline-snapshot-state" role="status">
          Offline · Rate Snapshot
        </p>
      ) : null}
      <p className="rate-disclaimer">
        Reference estimate; your payment rate may differ.
      </p>
    </section>
  );
}

export function ConversionLedger({
  price,
  sourceCurrency,
  targetCurrencies,
  isApprovedMember,
  rates,
  emptyMessage = "Point at a price to see the conversion.",
  onContinueAsGuest
}: {
  price: CurrencyAmount | null;
  sourceCurrency: CurrencyCode;
  targetCurrencies: CurrencyCode[];
  isApprovedMember: boolean;
  rates: GuestRateViews;
  emptyMessage?: string;
  onContinueAsGuest: () => void;
}) {
  const accessFailure = targetCurrencies
    .map((targetCurrency) => rates[targetCurrency])
    .find(
      (rate) =>
        rate?.phase === "error" &&
        (rate.reason === "unauthenticated" || rate.reason === "unauthorized")
    );
  return (
    <section
      className="conversion-ledger"
      aria-label={
        isApprovedMember ? "Approved Member conversions" : "Guest conversion"
      }
    >
      {accessFailure?.phase === "error" ? (
        <div className="conversion-card conversion-error" role="alert">
          <strong>Approved Member Reference Rates unavailable</strong>
          <p>{accessFailure.error}</p>
          <button
            className="text-button"
            type="button"
            onClick={onContinueAsGuest}
          >
            Continue as Guest
          </button>
        </div>
      ) : null}
      {targetCurrencies.map((targetCurrency) => (
        rates[targetCurrency]?.phase === "error" &&
        (rates[targetCurrency].reason === "unauthenticated" ||
          rates[targetCurrency].reason === "unauthorized") ? null : (
          <ConversionRow
            key={targetCurrency}
            price={price}
            sourceCurrency={sourceCurrency}
            targetCurrency={targetCurrency}
            guestRate={
              rates[targetCurrency] ?? {
                phase: "loading",
                rate: null,
                error: null,
                retry: () => undefined
              }
            }
            emptyMessage={emptyMessage}
          />
        )
      ))}
    </section>
  );
}


function RecognitionHealthDisclosure() {
  return (
    <div className="recognition-health-disclosure">
      <p>One future camera session may share only:</p>
      <ul>
        <li>app release and summary schema version;</li>
        <li>coarse platform family and Source Currency;</li>
        <li>bucketed readiness, first-detection, and first-focus timing;</li>
        <li>
          bucketed recognition pass, miss, focus-change, and stable-detection
          counts; and
        </li>
        <li>a fixed terminal outcome and broad error family.</li>
      </ul>
      <p>
        No account or stable identifier, camera or price content, coordinates,
        exact time, URL, referrer, locale, membership state, Target Currency,
        message, or stack is included.
      </p>
    </div>
  );
}

export function RecognitionHealthPrivacy({
  preferences,
  invitation,
  settingsOpen,
  onChange,
  onDismissInvitation,
  onCloseSettings
}: {
  preferences: RecognitionHealthPreferences;
  invitation: boolean;
  settingsOpen: boolean;
  onChange: (enabled: boolean) => void;
  onDismissInvitation: () => void;
  onCloseSettings: () => void;
}) {
  if (!invitation && !settingsOpen) return null;
  return (
    <section
      className="recognition-health-card"
      aria-label={
        settingsOpen
          ? "Privacy settings"
          : "Anonymous recognition health invitation"
      }
    >
      <div className="recognition-health-heading">
        <div>
          <span>
            {settingsOpen ? "Privacy settings" : "Optional privacy choice"}
          </span>
          <h2>Share anonymous recognition health</h2>
        </div>
        {settingsOpen ? (
          <button
            className="text-button"
            type="button"
            onClick={onCloseSettings}
          >
            Close settings
          </button>
        ) : null}
      </div>
      <RecognitionHealthDisclosure />
      {settingsOpen ? (
        <>
          <label className="recognition-health-toggle">
            <input
              type="checkbox"
              checked={preferences.sharingEnabled}
              onChange={(event) => onChange(event.target.checked)}
            />
            <span>Share for future camera sessions</span>
          </label>
          <p>
            This choice stays only in this browser and is independent of camera
            access. Prior anonymous contributions cannot be isolated; they remain
            only in thresholded aggregates until expiry.
          </p>
        </>
      ) : (
        <div className="recognition-health-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => onChange(true)}
          >
            Share future summaries
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={onDismissInvitation}
          >
            Not now
          </button>
        </div>
      )}
    </section>
  );
}

export function MemberStatusPanel({
  accessStatus,
  saveStatus,
  onRetryAccess,
  onRetrySave
}: {
  accessStatus: MemberAccessStatus;
  saveStatus: MemberSaveStatus;
  onRetryAccess: () => void;
  onRetrySave: () => void;
}) {
  if (accessStatus === "inactive") {
    return (
      <div className="account-status" role="status">
        <strong>Signed in with Guest limits</strong>
        <p>
          An active membership is not available. Continue scanning as a Guest
          or ask the owner to review access.
        </p>
      </div>
    );
  }
  if (accessStatus === "guest-choice") {
    return (
      <div className="account-status" role="status">
        <strong>Using Guest mode</strong>
        <p>
          The account remains signed in, but scanning now uses one Target
          Currency and browser-local preferences.
        </p>
      </div>
    );
  }
  if (accessStatus === "unavailable") {
    return (
      <div className="account-status account-error" role="alert">
        <strong>Could not verify Approved Member access</strong>
        <p>Check the connection or account session, then try again.</p>
        <button className="text-button" type="button" onClick={onRetryAccess}>
          Retry member access
        </button>
      </div>
    );
  }
  if (saveStatus === "error") {
    return (
      <div className="account-status account-error" role="alert">
        <strong>Member settings were not saved</strong>
        <p>
          Your choices remain visible here, but protected Reference Rates wait
          until D1 synchronization succeeds.
        </p>
        <button className="text-button" type="button" onClick={onRetrySave}>
          Retry saving settings
        </button>
      </div>
    );
  }
  if (saveStatus === "saving") {
    return (
      <div className="account-status" role="status">
        Saving member settings…
      </div>
    );
  }
  return null;
}
