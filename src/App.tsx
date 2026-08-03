import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode
} from "react";

import {
  createCameraSession,
  isCameraFailureStatus,
  type CameraSession,
  type CameraSnapshot,
  type CameraStatus
} from "./camera/cameraSession";
import {
  formatCurrencyMinorUnits,
  hasRecognizerAdapter,
  searchTargetCurrencies,
  SOURCE_CURRENCIES,
  type CurrencyAmount,
  type CurrencyCode,
  type RecognizerAdapterCurrencyCode,
  type SourceCurrencyCode
} from "./domain/currencies";
import {
  detectPhysicalPlatform,
  getCurrencyCapability
} from "./domain/currencyCapabilities";
import {
  createGuestPreferenceStore,
  type GuestPreferences
} from "./domain/guestPreferences";
import {
  getManualPriceEntryGuidance,
  parseManualPriceEntry,
  type EnteredPrice
} from "./domain/manualPriceEntry";
import {
  createBrowserRateSnapshotStore,
  createOfflineGuestRateLoader
} from "./fx/browserRateSnapshot";
import {
  loadGuestRateFromGateway,
  useGuestRates,
  type GuestRateViews,
  type GuestRateView,
  type LoadGuestRate
} from "./fx/useGuestRate";
import { convertWithReferenceRate } from "./fx/referenceRate";
import { createMemberRateLoader } from "./fx/memberRateClient";
import type { MemberPreferences } from "./member/memberPreferencesApi";
import {
  loadMemberPreferencesFromApi,
  MemberPreferencesRequestError,
  saveMemberPreferencesToApi,
  type LoadMemberPreferences,
  type SaveMemberPreferences
} from "./member/memberPreferencesClient";
import type { MemberSession } from "./member/sessionToken";
import {
  createBrowserRecognizer,
  useCameraRecognition,
  type CreateRecognizer,
  type RecognitionView
} from "./recognition/useCameraRecognition";
import { AccessibleDetectedPriceList } from "./recognition/AccessibleDetectedPriceList";
import { CameraExperienceOverlay } from "./recognition/CameraExperience";
import { useDemoRecognition } from "./recognition/useDemoRecognition";
import { RecognitionSummary } from "./recognition/RecognitionSummary";
import {
  resolveQualifiedRecognitionProfile,
  type RecognitionProfile,
  type ResolveRecognitionProfile
} from "./recognition/recognitionProfile";

import "./styles.css";

type ExperienceMode = "welcome" | "camera" | "demo" | "manual";

interface ExperiencePreferences {
  sourceCurrency: SourceCurrencyCode;
  targetCurrencies: CurrencyCode[];
}

type MemberAccessStatus =
  | "guest"
  | "loading"
  | "approved"
  | "inactive"
  | "guest-choice"
  | "unavailable";
type MemberSaveStatus = "idle" | "saving" | "error";
const CHECKING_MEMBER_ACCESS_LABEL = "Checking member access";
const MANUAL_ENTRY_PROMOTION_DELAY_MS = 5_000;
type ScheduleRecognitionProfileExpiry = (
  expiresAt: string,
  onExpire: () => void
) => () => void;

const scheduleRecognitionProfileExpiry: ScheduleRecognitionProfileExpiry = (
  expiresAt,
  onExpire
) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  let cancelled = false;
  const schedule = () => {
    if (cancelled) {
      return;
    }
    const remainingMs = Date.parse(expiresAt) - Date.now();
    if (remainingMs <= 0) {
      onExpire();
      return;
    }
    timeoutId = setTimeout(
      schedule,
      Math.min(remainingMs, 2_147_483_647)
    );
  };
  schedule();
  return () => {
    cancelled = true;
    clearTimeout(timeoutId);
  };
};
const statusContent: Partial<
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

function TagLingoMark() {
  return (
    <div className="brand" aria-label="TagLingo">
      <span className="brand-mark" aria-hidden="true">
        TL
      </span>
      <span>TagLingo</span>
    </div>
  );
}

function CurrencySettings({
  preferences,
  onChange,
  isApprovedMember,
  memberAccessStatus = isApprovedMember ? "approved" : "guest",
  compact = false
}: {
  preferences: ExperiencePreferences;
  onChange: (preferences: ExperiencePreferences) => void;
  isApprovedMember: boolean;
  memberAccessStatus?: MemberAccessStatus;
  compact?: boolean;
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
    onChange({ sourceCurrency, targetCurrencies });
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

function ManualPriceComposer({
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

function ManualPriceEntrySurface({
  preferences,
  isApprovedMember,
  memberAccessStatus,
  rates,
  cameraQualificationCandidate,
  onPreferencesChange,
  onClose,
  memberStatus,
  onContinueAsGuest
}: {
  preferences: ExperiencePreferences;
  isApprovedMember: boolean;
  memberAccessStatus: MemberAccessStatus;
  rates: GuestRateViews;
  cameraQualificationCandidate: boolean;
  onPreferencesChange: (preferences: ExperiencePreferences) => void;
  onClose: () => void;
  memberStatus: ReactNode;
  onContinueAsGuest: () => void;
}) {
  const [enteredPrice, setEnteredPrice] = useState<EnteredPrice | null>(null);

  useEffect(() => {
    setEnteredPrice(null);
  }, [preferences.sourceCurrency]);

  return (
    <main className="manual-entry-shell">
      <header className="manual-entry-header">
        <TagLingoMark />
        <button className="close-button" type="button" onClick={onClose}>
          <span aria-hidden="true">×</span> Close Manual Price Entry
        </button>
      </header>

      <section className="manual-entry-panel">
        <div className="manual-entry-intro">
          <span className="manual-entry-kicker">Available anytime</span>
          <h1>Manual Price Entry</h1>
          <p>
            Type the amount shown on the price tag. Entered Prices stay on this
            device and are not saved.
          </p>
        </div>

        <CurrencySettings
          preferences={preferences}
          onChange={onPreferencesChange}
          isApprovedMember={isApprovedMember}
          memberAccessStatus={memberAccessStatus}
          compact
        />
        {memberStatus}

        <div className="camera-capability-note" role="status">
          <strong>Camera recognition is unavailable on this device.</strong>
          <p>
            {cameraQualificationCandidate
              ? `${preferences.sourceCurrency} is an initial camera qualification candidate; ` +
                "Manual Price Entry remains available while evidence is pending."
              : `${preferences.sourceCurrency} is currently Manual Price Entry only.`}
          </p>
        </div>

        <ManualPriceComposer
          sourceCurrency={preferences.sourceCurrency}
          enteredPrice={enteredPrice}
          expanded
          onEnteredPriceChange={setEnteredPrice}
        />

        <ConversionLedger
          price={enteredPrice}
          sourceCurrency={preferences.sourceCurrency}
          targetCurrencies={preferences.targetCurrencies}
          isApprovedMember={isApprovedMember}
          rates={rates}
          emptyMessage="Enter a price to see the conversion."
          onContinueAsGuest={onContinueAsGuest}
        />
      </section>
    </main>
  );
}

function CameraSurface({
  demo,
  snapshot,
  preferences,
  isApprovedMember,
  memberAccessStatus,
  rates,
  onPreferencesChange,
  recognitionProfile,
  createRecognizer,
  onClose,
  onRetry,
  onPlaybackError,
  memberStatus,
  onContinueAsGuest
}: {
  demo: boolean;
  snapshot: CameraSnapshot;
  preferences: ExperiencePreferences & {
    sourceCurrency: RecognizerAdapterCurrencyCode;
  };
  isApprovedMember: boolean;
  memberAccessStatus: MemberAccessStatus;
  rates: GuestRateViews;
  onPreferencesChange: (preferences: ExperiencePreferences) => void;
  recognitionProfile: RecognitionProfile;
  createRecognizer: CreateRecognizer;
  onClose: () => void;
  onRetry: () => void;
  onPlaybackError: () => void;
  memberStatus: ReactNode;
  onContinueAsGuest: () => void;
}) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [preview, setPreview] = useState<HTMLElement | null>(null);
  const [captureGuide, setCaptureGuide] = useState<HTMLElement | null>(null);
  const [recognitionRestartKey, setRecognitionRestartKey] = useState(0);
  const [enteredPrice, setEnteredPrice] = useState<EnteredPrice | null>(null);
  const [manualEntryExpanded, setManualEntryExpanded] = useState(false);
  const [enteredPriceInUse, setEnteredPriceInUse] = useState(false);
  const manualPromotionHandledRef = useRef(false);
  const demoRecognition = useDemoRecognition(
    demo && preferences.sourceCurrency === "JPY"
  );
  const cameraRecognition = useCameraRecognition({
    enabled: !demo && snapshot.status === "active",
    profile: recognitionProfile,
    video,
    preview,
    captureGuide,
    createRecognizer,
    recognitionRestartKey
  });
  const recognition = demo ? demoRecognition : cameraRecognition;
  const previewBounds = preview?.getBoundingClientRect();
  const detectedPricePreviewSize = demo
    ? { width: 1_000, height: 1_000 }
    : {
        width: previewBounds?.width ?? 1,
        height: previewBounds?.height ?? 1
      };

  useEffect(() => {
    setEnteredPrice(null);
    setManualEntryExpanded(false);
    setEnteredPriceInUse(false);
    manualPromotionHandledRef.current = false;
  }, [preferences.sourceCurrency]);

  useEffect(() => {
    if (
      recognition.phase === "error" ||
      isCameraFailureStatus(snapshot.status)
    ) {
      manualPromotionHandledRef.current = true;
      setManualEntryExpanded(true);
    }
  }, [recognition.phase, snapshot.status]);

  useEffect(() => {
    if (recognition.focusedPrice) {
      manualPromotionHandledRef.current = false;
      return;
    }
    if (manualEntryExpanded || manualPromotionHandledRef.current) {
      return;
    }
    const promotion = window.setTimeout(() => {
      manualPromotionHandledRef.current = true;
      setManualEntryExpanded(true);
    }, MANUAL_ENTRY_PROMOTION_DELAY_MS);
    return () => window.clearTimeout(promotion);
  }, [manualEntryExpanded, recognition.focusedPrice]);

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

  const enteredPriceLabel = enteredPrice
    ? `${enteredPrice.currency} ${enteredPrice.displayAmount}`
    : null;
  const focusedPriceLabel = recognition.focusedPrice
    ? `${recognition.focusedPrice.currency} ${formatCurrencyMinorUnits(
        recognition.focusedPrice.minorUnits,
        recognition.focusedPrice.currency
      )}`
    : null;
  const priceInUse = (() => {
    if (enteredPriceInUse && enteredPrice) {
      return {
        price: enteredPrice,
        title: "Entered Price in use",
        detail: "Entered manually · not camera-derived",
        switchLabel: recognition.focusedPrice
          ? `Use Focused Price · ${focusedPriceLabel}`
          : null,
        switchToEnteredPrice: false
      };
    }
    if (recognition.focusedPrice) {
      return {
        price: recognition.focusedPrice,
        title: "Focused Price in use",
        detail: "Camera-derived evidence",
        switchLabel: enteredPrice
          ? `Use Entered Price · ${enteredPriceLabel}`
          : null,
        switchToEnteredPrice: true
      };
    }
    return {
      price: null,
      title: "Waiting for a Focused Price",
      detail: "Manual Price Entry remains available.",
      switchLabel: enteredPrice
        ? `Use Entered Price · ${enteredPriceLabel}`
        : null,
      switchToEnteredPrice: true
    };
  })();

  return (
    <main className="camera-shell">
      <header className="camera-header">
        <TagLingoMark />
        <button className="close-button" type="button" onClick={onClose}>
          <span aria-hidden="true">×</span> Close camera
        </button>
      </header>

      <section ref={setPreview} className="preview" aria-label="Price camera">
        {snapshot.stream ? (
          <VideoPreview
            stream={snapshot.stream}
            onReady={setVideo}
            onPlaybackError={onPlaybackError}
          />
        ) : null}
        <div className={`preview-fallback ${demo ? "demo-preview" : ""}`} />
        <CameraExperienceOverlay
          demo={demo}
          recognition={recognition}
          onCaptureGuideReady={setCaptureGuide}
        />
        <div className="privacy-chip">
          <span aria-hidden="true">●</span> Local preview
        </div>
      </section>

      <section className="result-sheet" aria-label="Camera controls and status">
        <div className="sheet-handle" aria-hidden="true" />
        <CurrencySettings
          preferences={preferences}
          onChange={onPreferencesChange}
          isApprovedMember={isApprovedMember}
          memberAccessStatus={memberAccessStatus}
          compact
        />
        {memberStatus}
        <StatusPanel
          status={snapshot.status}
          demo={demo}
          recognition={recognition}
          sourceCurrency={preferences.sourceCurrency}
          onRetry={onRetry}
          onRecognitionRetry={() =>
            setRecognitionRestartKey((restartKey) => restartKey + 1)
          }
        />
        <RecognitionSummary recognition={recognition} demo={demo} />
        <AccessibleDetectedPriceList
          detectedPrices={recognition.detectedPrices}
          focusedPrice={recognition.focusedPrice}
          explicitlyFocusedPriceIdentity={
            recognition.explicitlyFocusedPriceIdentity
          }
          previewSize={detectedPricePreviewSize}
          onSelect={recognition.selectDetectedPrice}
        />
        <ManualPriceComposer
          sourceCurrency={preferences.sourceCurrency}
          enteredPrice={enteredPrice}
          expanded={manualEntryExpanded}
          compact
          onEnteredPriceChange={updateEnteredPrice}
          onExpandedChange={updateManualEntryExpanded}
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
              onClick={() =>
                setEnteredPriceInUse(priceInUse.switchToEnteredPrice)
              }
            >
              {priceInUse.switchLabel}
            </button>
          ) : null}
        </section>
        <ConversionLedger
          price={priceInUse.price}
          sourceCurrency={preferences.sourceCurrency}
          targetCurrencies={preferences.targetCurrencies}
          isApprovedMember={isApprovedMember}
          rates={rates}
          onContinueAsGuest={onContinueAsGuest}
        />
      </section>
    </main>
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

function ConversionLedger({
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

function Feature({
  icon,
  children
}: {
  icon: string;
  children: ReactNode;
}) {
  return (
    <li>
      <span aria-hidden="true">{icon}</span>
      <p>{children}</p>
    </li>
  );
}

function getBrowserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function MemberStatusPanel({
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

export default function App({
  createRecognizer = createBrowserRecognizer,
  resolveRecognitionProfile = resolveQualifiedRecognitionProfile,
  loadGuestRate,
  admission,
  memberSession = null,
  loadMemberPreferences = loadMemberPreferencesFromApi,
  saveMemberPreferences = saveMemberPreferencesToApi,
  scheduleProfileExpiry = scheduleRecognitionProfileExpiry
}: {
  createRecognizer?: CreateRecognizer;
  resolveRecognitionProfile?: ResolveRecognitionProfile;
  loadGuestRate?: LoadGuestRate;
  admission?: ReactNode;
  memberSession?: MemberSession | null;
  loadMemberPreferences?: LoadMemberPreferences;
  saveMemberPreferences?: SaveMemberPreferences;
  scheduleProfileExpiry?: ScheduleRecognitionProfileExpiry;
}) {
  const memberUserId = memberSession?.userId ?? null;
  const getMemberSessionToken = memberSession?.getSessionToken;
  const preferenceStoreRef = useRef(
    createGuestPreferenceStore(getBrowserStorage())
  );
  const rateSnapshotStoreRef = useRef(
    createBrowserRateSnapshotStore(getBrowserStorage())
  );
  const browserRateLoaderRef = useRef<LoadGuestRate | null>(null);
  browserRateLoaderRef.current ??= createOfflineGuestRateLoader({
    loadOnline: loadGuestRateFromGateway,
    store: rateSnapshotStoreRef.current
  });
  const [guestPreferences, setGuestPreferences] = useState(() =>
    preferenceStoreRef.current.load()
  );
  const [memberPreferences, setMemberPreferences] =
    useState<MemberPreferences | null>(null);
  const [
    synchronizedMemberPreferences,
    setSynchronizedMemberPreferences
  ] = useState<MemberPreferences | null>(null);
  const [memberAccessStatus, setMemberAccessStatus] = useState<
    MemberAccessStatus
  >(memberUserId ? "loading" : "guest");
  const [memberAccessAttempt, setMemberAccessAttempt] = useState(0);
  const [useGuestMode, setUseGuestMode] = useState(false);
  const [memberSaveStatus, setMemberSaveStatus] =
    useState<MemberSaveStatus>("idle");
  const memberSaveRef = useRef<AbortController | null>(null);
  const pendingMemberPreferencesRef = useRef<MemberPreferences | null>(null);
  useEffect(() => setUseGuestMode(false), [memberUserId]);
  useEffect(() => {
    memberSaveRef.current?.abort();
    pendingMemberPreferencesRef.current = null;
    setMemberSaveStatus("idle");
    if (!memberUserId) {
      setMemberAccessStatus("guest");
      setMemberPreferences(null);
      setSynchronizedMemberPreferences(null);
      return undefined;
    }
    const controller = new AbortController();
    setMemberAccessStatus("loading");
    setMemberPreferences(null);
    setSynchronizedMemberPreferences(null);
    void loadMemberPreferences(memberUserId, controller.signal)
      .then(async (saved) => {
        if (controller.signal.aborted) {
          return;
        }
        const restored =
          saved ?? {
            ownerId: memberUserId,
            sourceCurrency: guestPreferences.sourceCurrency,
            targetCurrencies: [guestPreferences.targetCurrency]
          };
        const synchronized = saved
          ? restored
          : await saveMemberPreferences(restored, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setMemberPreferences(synchronized);
        setSynchronizedMemberPreferences(synchronized);
        setMemberAccessStatus("approved");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMemberAccessStatus(
            error instanceof MemberPreferencesRequestError &&
              error.kind === "inactive-membership"
              ? "inactive"
              : "unavailable"
          );
          setMemberPreferences(null);
          setSynchronizedMemberPreferences(null);
        }
      });
    return () => controller.abort();
  }, [
    guestPreferences.sourceCurrency,
    guestPreferences.targetCurrency,
    loadMemberPreferences,
    memberAccessAttempt,
    memberUserId,
    saveMemberPreferences
  ]);
  const isApprovedMember =
    Boolean(memberUserId) &&
    !useGuestMode &&
    memberAccessStatus === "approved" &&
    memberPreferences !== null;
  const preferences: ExperiencePreferences = isApprovedMember
    ? {
        sourceCurrency: memberPreferences.sourceCurrency,
        targetCurrencies: memberPreferences.targetCurrencies
      }
    : {
        sourceCurrency: guestPreferences.sourceCurrency,
        targetCurrencies: [guestPreferences.targetCurrency]
      };
  const physicalPlatform = detectPhysicalPlatform(navigator.userAgent);
  const currencyCapability = getCurrencyCapability(
    preferences.sourceCurrency,
    physicalPlatform
  );
  const [, refreshRecognitionProfile] = useState(0);
  const recognitionProfile = resolveRecognitionProfile(
    preferences.sourceCurrency,
    physicalPlatform
  );
  useEffect(() => {
    if (!recognitionProfile) {
      return undefined;
    }
    return scheduleProfileExpiry(
      recognitionProfile.evidence.expiresAt,
      () => refreshRecognitionProfile((version) => version + 1)
    );
  }, [recognitionProfile, scheduleProfileExpiry]);
  const cameraSupported =
    hasRecognizerAdapter(preferences.sourceCurrency) &&
    recognitionProfile !== null;
  const ratePreferences: ExperiencePreferences =
    isApprovedMember && synchronizedMemberPreferences
      ? {
          sourceCurrency: synchronizedMemberPreferences.sourceCurrency,
          targetCurrencies:
            synchronizedMemberPreferences.targetCurrencies
        }
      : preferences;
  const sessionRef = useRef<CameraSession | null>(null);
  const [cameraSnapshot, setCameraSnapshot] = useState<CameraSnapshot>({
    status: "idle",
    stream: null
  });
  const [mode, setMode] = useState<ExperienceMode>("welcome");
  useEffect(() => {
    if (
      (mode === "camera" || mode === "demo") &&
      !cameraSupported
    ) {
      sessionRef.current?.stop();
      setMode("manual");
    }
  }, [cameraSupported, mode]);
  useEffect(() => {
    rateSnapshotStoreRef.current.retainActivePairs(
      ratePreferences.targetCurrencies.map((target) => ({
        source: ratePreferences.sourceCurrency,
        target
      }))
    );
  }, [ratePreferences.sourceCurrency, ratePreferences.targetCurrencies]);
  const approvedMemberRateLoader = useMemo(
    () =>
      memberUserId && getMemberSessionToken
        ? createMemberRateLoader(memberUserId, getMemberSessionToken)
        : null,
    [getMemberSessionToken, memberUserId]
  );
  const loadRate =
    loadGuestRate ??
    (isApprovedMember && approvedMemberRateLoader
      ? approvedMemberRateLoader
      : browserRateLoaderRef.current);
  const rates = useGuestRates(
    ratePreferences.sourceCurrency,
    ratePreferences.targetCurrencies,
    loadRate
  );
  const displayedRates =
    isApprovedMember &&
    (preferences.sourceCurrency !== ratePreferences.sourceCurrency ||
      preferences.targetCurrencies.join(",") !==
        ratePreferences.targetCurrencies.join(","))
      ? {}
      : rates;

  useEffect(() => {
    const session = createCameraSession({
      mediaDevices: navigator.mediaDevices,
      document
    });
    sessionRef.current = session;
    const unsubscribe = session.subscribe(setCameraSnapshot);
    return () => {
      unsubscribe();
      session.dispose();
      if (sessionRef.current === session) {
        sessionRef.current = null;
      }
    };
  }, []);

  const persistMemberPreferences = (preferences: MemberPreferences) => {
    pendingMemberPreferencesRef.current = preferences;
    memberSaveRef.current?.abort();
    const controller = new AbortController();
    memberSaveRef.current = controller;
    setMemberSaveStatus("saving");
    void saveMemberPreferences(preferences, controller.signal)
      .then((saved) => {
        if (!controller.signal.aborted) {
          pendingMemberPreferencesRef.current = null;
          setMemberPreferences(saved);
          setSynchronizedMemberPreferences(saved);
          setMemberSaveStatus("idle");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMemberSaveStatus("error");
        }
      });
  };

  const updatePreferences = (nextPreferences: ExperiencePreferences) => {
    if (isApprovedMember && memberUserId) {
      const synchronized: MemberPreferences = {
        ownerId: memberUserId,
        ...nextPreferences
      };
      setMemberPreferences(synchronized);
      persistMemberPreferences(synchronized);
    } else {
      const guest: GuestPreferences = {
        sourceCurrency: nextPreferences.sourceCurrency,
        targetCurrency: nextPreferences.targetCurrencies[0]
      };
      setGuestPreferences(guest);
      preferenceStoreRef.current.save(guest);
    }

    if (
      nextPreferences.sourceCurrency !== preferences.sourceCurrency &&
      (!hasRecognizerAdapter(nextPreferences.sourceCurrency) ||
        !resolveRecognitionProfile(
          nextPreferences.sourceCurrency,
          physicalPlatform
        ))
    ) {
      sessionRef.current?.stop();
      setMode("manual");
    }
  };

  const startCamera = async () => {
    if (!cameraSupported) {
      sessionRef.current?.stop();
      setMode("manual");
      return;
    }
    setMode("camera");
    await sessionRef.current?.start();
  };

  const openDemo = () => {
    sessionRef.current?.stop();
    setMode(cameraSupported ? "demo" : "manual");
  };

  const closeExperience = () => {
    sessionRef.current?.stop();
    setMode("welcome");
  };
  const handlePlaybackError = useCallback(() => {
    sessionRef.current?.interrupt();
  }, []);
  const memberStatus = (
    <MemberStatusPanel
      accessStatus={useGuestMode ? "guest-choice" : memberAccessStatus}
      saveStatus={memberSaveStatus}
      onRetryAccess={() => setMemberAccessAttempt((attempt) => attempt + 1)}
      onRetrySave={() => {
        if (pendingMemberPreferencesRef.current) {
          persistMemberPreferences(pendingMemberPreferencesRef.current);
        }
      }}
    />
  );

  if (mode === "manual") {
    return (
      <ManualPriceEntrySurface
        preferences={preferences}
        isApprovedMember={isApprovedMember}
        memberAccessStatus={memberAccessStatus}
        rates={displayedRates}
        cameraQualificationCandidate={
          currencyCapability.cameraQualificationCandidate
        }
        onPreferencesChange={updatePreferences}
        onClose={closeExperience}
        memberStatus={memberStatus}
        onContinueAsGuest={() => setUseGuestMode(true)}
      />
    );
  }

  if (
    mode !== "welcome" &&
    hasRecognizerAdapter(preferences.sourceCurrency) &&
    cameraSupported &&
    recognitionProfile
  ) {
    return (
      <CameraSurface
        demo={mode === "demo"}
        snapshot={cameraSnapshot}
        preferences={{
          ...preferences,
          sourceCurrency: preferences.sourceCurrency
        }}
        isApprovedMember={isApprovedMember}
        memberAccessStatus={memberAccessStatus}
        rates={displayedRates}
        onPreferencesChange={updatePreferences}
        recognitionProfile={recognitionProfile}
        createRecognizer={createRecognizer}
        onClose={closeExperience}
        onRetry={startCamera}
        onPlaybackError={handlePlaybackError}
        memberStatus={memberStatus}
        onContinueAsGuest={() => setUseGuestMode(true)}
      />
    );
  }

  const failure =
    cameraSnapshot.status !== "idle" &&
    isCameraFailureStatus(cameraSnapshot.status)
      ? statusContent[cameraSnapshot.status]
      : undefined;

  return (
    <main className="welcome-shell">
      <nav className="topbar" aria-label="Primary">
        <TagLingoMark />
        <span className="guest-badge">
          {isApprovedMember
            ? "Approved Member mode"
            : memberAccessStatus === "loading" && memberUserId
              ? CHECKING_MEMBER_ACCESS_LABEL
              : memberAccessStatus === "unavailable"
                ? "Member access unavailable"
                : memberAccessStatus === "inactive"
                  ? "Signed in · Guest limits"
                  : useGuestMode
                    ? "Signed in · Guest limits"
                    : "Guest mode"}
        </span>
      </nav>

      <section className="hero">
        <div className="eyebrow">
          <span>Private by design</span>
          <i />
          <span>Built for travel</span>
        </div>
        <h1>
          Understand any price.
          <br />
          <em>Keep it private.</em>
        </h1>
        <p className="hero-copy">
          Choose any provider-backed Source Currency, enter the amount, and
          translate it into a currency you know with a Reference Rate.
        </p>

        <div className="permission-card">
          <div className="permission-icon" aria-hidden="true">
            <span />
          </div>
          <div>
            <h2>
              {cameraSupported
                ? "Before we ask for camera access"
                : "Manual Price Entry is ready"}
            </h2>
            {cameraSupported ? (
              <p>
                The rear camera helps you point naturally at retail price tags.
                Camera frames stay on this device and are never uploaded.
              </p>
            ) : (
              <p>
                Camera recognition is unavailable on this device. You can
                still enter a price without granting camera access.
              </p>
            )}
          </div>
        </div>

        <CurrencySettings
          preferences={preferences}
          onChange={updatePreferences}
          isApprovedMember={isApprovedMember}
          memberAccessStatus={memberAccessStatus}
        />
        {memberStatus}

        {failure ? (
          <div className="failure-card" role="alert">
            <strong>{failure.title}</strong>
            <p>{failure.detail}</p>
          </div>
        ) : null}

        <div className="primary-actions">
          <button className="primary-button" type="button" onClick={startCamera}>
            <span
              className={cameraSupported ? "button-camera" : "button-manual"}
              aria-hidden="true"
            />
            {cameraSupported ? "Open camera" : "Enter price manually"}
            <span aria-hidden="true">→</span>
          </button>
          {cameraSupported ? (
            <button className="secondary-button" type="button" onClick={openDemo}>
              Try without camera
            </button>
          ) : null}
          {failure ? (
            <button className="retry-button" type="button" onClick={startCamera}>
              Try camera again
            </button>
          ) : null}
        </div>

        {admission}

        <ul className="feature-list" aria-label="Privacy and access details">
          <Feature icon="◎">
            <strong>On-device</strong>
            <br />
            Camera images stay local
          </Feature>
          <Feature icon="◌">
            <strong>Guest friendly</strong>
            <br />
            No account required
          </Feature>
          <Feature icon="↺">
            <strong>Remembered here</strong>
            <br />
            Preferences stay in this browser
          </Feature>
        </ul>
      </section>

      <footer>
        <p>
          Manual Price Entry is universal. Camera availability is qualified
          separately for each Source Currency and physical platform.
        </p>
        {cameraSupported ? (
          <p>Physical-device qualification applies to this camera path.</p>
        ) : null}
      </footer>
    </main>
  );
}
