import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
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
  searchTargetCurrencies,
  SOURCE_CURRENCIES,
  TARGET_CURRENCIES,
  type CurrencyCode
} from "./domain/currencies";
import {
  createGuestPreferenceStore,
  type GuestPreferences
} from "./domain/guestPreferences";
import {
  loadGuestRateFromGateway,
  useGuestRate,
  type GuestRateView,
  type LoadGuestRate
} from "./fx/useGuestRate";
import {
  createBrowserJpyRecognizer,
  useCameraRecognition,
  type CreateJpyRecognizer,
  type RecognitionView
} from "./recognition/useCameraRecognition";
import { useDemoRecognition } from "./recognition/useDemoRecognition";

import "./styles.css";

type ExperienceMode = "welcome" | "camera" | "demo";

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
  compact = false
}: {
  preferences: GuestPreferences;
  onChange: (preferences: GuestPreferences) => void;
  compact?: boolean;
}) {
  const [targetQuery, setTargetQuery] = useState("");
  const matches = searchTargetCurrencies(targetQuery).filter(
    ({ code }) => code !== preferences.sourceCurrency
  );
  const selectedTarget = TARGET_CURRENCIES.find(
    ({ code }) =>
      code === preferences.targetCurrency &&
      code !== preferences.sourceCurrency
  );
  const visibleTargets = matches.some(
    ({ code }) => code === preferences.targetCurrency
  )
    ? matches
    : selectedTarget
      ? [selectedTarget, ...matches]
      : matches;

  const update =
    (key: keyof GuestPreferences) =>
    (event: ChangeEvent<HTMLSelectElement>) => {
      const selectedCurrency = event.target.value as CurrencyCode;
      const nextPreferences = {
        ...preferences,
        [key]: selectedCurrency
      };
      if (
        key === "sourceCurrency" &&
        selectedCurrency === preferences.targetCurrency
      ) {
        nextPreferences.targetCurrency = preferences.sourceCurrency;
      }
      onChange(nextPreferences);
    };

  return (
    <div className={compact ? "currency-grid compact" : "currency-grid"}>
      <label className="field">
        <span>Source Currency</span>
        <select
          name={compact ? "cameraSourceCurrency" : "sourceCurrency"}
          value={preferences.sourceCurrency}
          onChange={update("sourceCurrency")}
        >
          {SOURCE_CURRENCIES.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.name}
            </option>
          ))}
        </select>
      </label>

      <div className="target-fields">
        <label className="field search-field">
          <span>Find Target Currency</span>
          <input
            name={compact ? "cameraTargetCurrencySearch" : "targetCurrencySearch"}
            type="search"
            value={targetQuery}
            onChange={(event) => setTargetQuery(event.target.value)}
            placeholder="Code, name, or alias"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>
            Target Currency <em>Guest · 1</em>
          </span>
          <select
            name={compact ? "cameraTargetCurrency" : "targetCurrency"}
            value={preferences.targetCurrency}
            onChange={update("targetCurrency")}
          >
            {visibleTargets.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} — {currency.name}
              </option>
            ))}
          </select>
        </label>
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

function FocusReticle({
  demo,
  recognition
}: {
  demo: boolean;
  recognition: RecognitionView;
}) {
  const displayedPrices =
    recognition.focusedPrice &&
    !recognition.detectedPrices.includes(recognition.focusedPrice)
      ? [...recognition.detectedPrices, recognition.focusedPrice]
      : recognition.detectedPrices;

  return (
    <div className="focus-stage">
      {demo ? (
        <div className="demo-tag">
          <span className="demo-kicker">税込価格</span>
          <strong>4,142円</strong>
          <small>travel notebook</small>
        </div>
      ) : null}
      {displayedPrices.map((price) => (
        <div
          key={`${price.minorUnits}-${price.box.x}-${price.box.y}`}
          className={`detected-price ${
            recognition.focusedPrice === price ? "focused-detection" : ""
          }`}
          style={
            demo
              ? {
                  left: `${price.box.x / 10}%`,
                  top: `${price.box.y / 10}%`,
                  width: `${price.box.width / 10}%`,
                  height: `${price.box.height / 10}%`
                }
              : {
                  left: price.box.x,
                  top: price.box.y,
                  width: price.box.width,
                  height: price.box.height
                }
          }
          role="img"
          aria-label={`Detected Price ${price.currency} ${price.minorUnits.toLocaleString(
            "en-US"
          )}`}
        >
          <span aria-hidden="true">
            {recognition.focusedPrice === price ? "Focused" : "Detected"}
          </span>
        </div>
      ))}
      <div className="reticle" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

function PreparationStatus({
  detail,
  progress
}: {
  detail: string;
  progress: number;
}) {
  return (
    <div className="scan-status" role="status">
      <span className="status-dot" />
      <div>
        <strong>Preparing Japanese recognition…</strong>
        <progress
          aria-label="Preparing Japanese recognition"
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
  onRetry
}: {
  status: CameraStatus;
  demo: boolean;
  recognition: RecognitionView;
  onRetry: () => void;
}) {
  if (demo) {
    if (recognition.phase === "preparing") {
      return (
        <PreparationStatus
          detail="Loading pinned on-device language assets from TagLingo."
          progress={recognition.progress}
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
      />
    );
  }

  if (recognition.phase === "error") {
    return (
      <div className="scan-status" role="alert">
        <span className="status-dot" />
        <div>
          <strong>Recognition could not start</strong>
          <p>Reload the scanner or use the no-camera demonstration.</p>
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

function CameraSurface({
  demo,
  snapshot,
  preferences,
  guestRate,
  onPreferencesChange,
  createRecognizer,
  onClose,
  onRetry,
  onPlaybackError
}: {
  demo: boolean;
  snapshot: CameraSnapshot;
  preferences: GuestPreferences;
  guestRate: GuestRateView;
  onPreferencesChange: (preferences: GuestPreferences) => void;
  createRecognizer: CreateJpyRecognizer;
  onClose: () => void;
  onRetry: () => void;
  onPlaybackError: () => void;
}) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [preview, setPreview] = useState<HTMLElement | null>(null);
  const demoRecognition = useDemoRecognition(
    demo && preferences.sourceCurrency === "JPY"
  );
  const cameraRecognition = useCameraRecognition({
    enabled: !demo && snapshot.status === "active",
    sourceCurrency: preferences.sourceCurrency,
    video,
    preview,
    createRecognizer
  });
  const recognition = demo ? demoRecognition : cameraRecognition;

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
        <FocusReticle demo={demo} recognition={recognition} />
        <div className="privacy-chip">
          <span aria-hidden="true">●</span> Local preview
        </div>
      </section>

      <section className="result-sheet" aria-label="Camera controls and status">
        <div className="sheet-handle" aria-hidden="true" />
        <CurrencySettings
          preferences={preferences}
          onChange={onPreferencesChange}
          compact
        />
        <StatusPanel
          status={snapshot.status}
          demo={demo}
          recognition={recognition}
          onRetry={onRetry}
        />
        <div className="recognition-note" aria-live="polite">
          <span aria-hidden="true">⌁</span>
          <p>
            <strong>
              {recognition.focusedPrice
                ? `Focused Price · ${recognition.focusedPrice.currency} ${recognition.focusedPrice.minorUnits.toLocaleString(
                    "en-US"
                  )}`
                : demo
                  ? "No Focused Price yet"
                  : "No Detected Price yet"}
            </strong>
            <br />
            {recognition.focusedPrice
              ? "Two compatible observations matched the exact price-token rectangle."
              : demo
                ? "The recorded observation is being checked twice for stability."
                : preferences.sourceCurrency !== "JPY"
                  ? "Choose JPY as the Source Currency for this recognition tracer bullet."
                  : "Hold steady, improve the lighting, or move closer to the price tag."}
          </p>
        </div>
        <ConversionResult
          focusedMinorUnits={recognition.focusedPrice?.minorUnits ?? null}
          focusedCurrency={recognition.focusedPrice?.currency ?? null}
          sourceCurrency={preferences.sourceCurrency}
          targetCurrency={preferences.targetCurrency}
          guestRate={guestRate}
        />
      </section>
    </main>
  );
}

function currencyFractionDigits(currency: CurrencyCode): number {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).resolvedOptions().maximumFractionDigits ?? 2;
}

function ConversionResult({
  focusedMinorUnits,
  focusedCurrency,
  sourceCurrency,
  targetCurrency,
  guestRate
}: {
  focusedMinorUnits: number | null;
  focusedCurrency: CurrencyCode | null;
  sourceCurrency: CurrencyCode;
  targetCurrency: CurrencyCode;
  guestRate: GuestRateView;
}) {
  if (guestRate.phase === "loading") {
    return (
      <div className="conversion-card" role="status">
        <strong>Loading Reference Rate…</strong>
      </div>
    );
  }
  if (guestRate.phase === "error") {
    return (
      <div className="conversion-card conversion-error" role="alert">
        <strong>Conversion unavailable</strong>
        <p>{guestRate.error}</p>
      </div>
    );
  }
  if (
    focusedMinorUnits === null ||
    focusedCurrency === null ||
    focusedCurrency !== sourceCurrency
  ) {
    return (
      <div className="conversion-card" role="status">
        <strong>Reference Rate ready</strong>
        <p>Point at a price to see the Guest conversion.</p>
      </div>
    );
  }

  const sourceAmount =
    focusedMinorUnits / 10 ** currencyFractionDigits(sourceCurrency);
  const converted = sourceAmount * Number(guestRate.rate.value);
  const formatted = converted.toLocaleString("en-US", {
    minimumFractionDigits: currencyFractionDigits(targetCurrency),
    maximumFractionDigits: currencyFractionDigits(targetCurrency)
  });

  return (
    <section className="conversion-card" aria-label="Guest conversion">
      <div className="conversion-heading">
        <span>Guest conversion</span>
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
      <p className="rate-disclaimer">
        Reference estimate; your payment rate may differ.
      </p>
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

export default function App({
  createRecognizer = createBrowserJpyRecognizer,
  loadGuestRate = loadGuestRateFromGateway
}: {
  createRecognizer?: CreateJpyRecognizer;
  loadGuestRate?: LoadGuestRate;
}) {
  const preferenceStoreRef = useRef(
    createGuestPreferenceStore(getBrowserStorage())
  );
  const [preferences, setPreferences] = useState(() =>
    preferenceStoreRef.current.load()
  );
  const sessionRef = useRef<CameraSession | null>(null);
  const [cameraSnapshot, setCameraSnapshot] = useState<CameraSnapshot>({
    status: "idle",
    stream: null
  });
  const [mode, setMode] = useState<ExperienceMode>("welcome");
  const guestRate = useGuestRate(
    preferences.sourceCurrency,
    preferences.targetCurrency,
    loadGuestRate
  );

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

  const updatePreferences = (nextPreferences: GuestPreferences) => {
    setPreferences(nextPreferences);
    preferenceStoreRef.current.save(nextPreferences);
  };

  const startCamera = async () => {
    setMode("camera");
    await sessionRef.current?.start();
  };

  const openDemo = () => {
    sessionRef.current?.stop();
    setMode("demo");
  };

  const closeCamera = () => {
    sessionRef.current?.stop();
    setMode("welcome");
  };
  const handlePlaybackError = useCallback(() => {
    sessionRef.current?.interrupt();
  }, []);

  if (mode !== "welcome") {
    return (
      <CameraSurface
        demo={mode === "demo"}
        snapshot={cameraSnapshot}
        preferences={preferences}
        guestRate={guestRate}
        onPreferencesChange={updatePreferences}
        createRecognizer={createRecognizer}
        onClose={closeCamera}
        onRetry={startCamera}
        onPlaybackError={handlePlaybackError}
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
        <span className="guest-badge">Guest mode</span>
      </nav>

      <section className="hero">
        <div className="eyebrow">
          <span>Private by design</span>
          <i />
          <span>Built for travel</span>
        </div>
        <h1>
          Point at a price.
          <br />
          <em>Keep it private.</em>
        </h1>
        <p className="hero-copy">
          TagLingo will recognize a price in your camera view and translate it
          into a currency you know—without sending the image anywhere.
        </p>

        <div className="permission-card">
          <div className="permission-icon" aria-hidden="true">
            <span />
          </div>
          <div>
            <h2>Before we ask for camera access</h2>
            <p>
              The rear camera helps you point naturally at retail price tags.
              Camera frames stay on this device and are never uploaded.
            </p>
          </div>
        </div>

        <CurrencySettings
          preferences={preferences}
          onChange={updatePreferences}
        />

        {failure ? (
          <div className="failure-card" role="alert">
            <strong>{failure.title}</strong>
            <p>{failure.detail}</p>
          </div>
        ) : null}

        <div className="primary-actions">
          <button className="primary-button" type="button" onClick={startCamera}>
            <span className="button-camera" aria-hidden="true" />
            Open camera
            <span aria-hidden="true">→</span>
          </button>
          <button className="secondary-button" type="button" onClick={openDemo}>
            Try without camera
          </button>
          {failure ? (
            <button className="retry-button" type="button" onClick={startCamera}>
              Try camera again
            </button>
          ) : null}
        </div>

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
          Recognition setup begins only after you choose a camera or demo path.
        </p>
        <p>Physical-iPhone OCR performance remains unvalidated.</p>
      </footer>
    </main>
  );
}
