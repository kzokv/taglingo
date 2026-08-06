import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import {
  createCameraSession,
  isCameraFailureStatus,
  type CameraSession,
  type CameraSnapshot
} from "./camera/cameraSession";
import type {
  CameraWorkspaceAccessStatus as MemberAccessStatus,
  CameraWorkspaceSaveStatus as MemberSaveStatus
} from "./camera/cameraWorkspace";
import {
  LiveCameraWorkspace,
  statusContent
} from "./camera/CameraWorkspaceView";
import {
  CHECKING_MEMBER_ACCESS_LABEL,
  ConversionLedger,
  CurrencySettings,
  ManualPriceComposer,
  MemberStatusPanel,
  RecognitionExperienceSettings,
  RecognitionHealthPrivacy,
  TagLingoMark,
  type ExperiencePreferences
} from "./camera/WorkspaceControls";
import {
  createCameraUsageSession,
  type CameraUsageSession
} from "./camera/cameraUsageSession";
import {
  isGuestCameraCurrency,
  resolveFoundationCameraAccess,
  type ResolveCameraAccess
} from "./domain/cameraAccess";
import {
  type CurrencyCode,
  type SourceCurrencyCode
} from "./domain/currencies";
import {
  createGuestPreferenceStore,
  type GuestPreferences
} from "./domain/guestPreferences";
import {
  createGuestCameraAllowanceStore,
  createWebLocksGuestCameraAllowanceLock,
  GUEST_CAMERA_USAGE_LIMIT,
  type GuestCameraAllowanceSnapshot,
  type GuestCameraAllowanceStore
} from "./domain/guestCameraAllowance";
import type { EnteredPrice } from "./domain/manualPriceEntry";
import {
  createBrowserRateSnapshotStore,
  createOfflineGuestRateLoader
} from "./fx/browserRateSnapshot";
import {
  loadGuestRateFromGateway,
  useGuestRates,
  type GuestRateViews,
  type LoadGuestRate
} from "./fx/useGuestRate";
import { createMemberRateLoader } from "./fx/memberRateClient";
import {
  DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS,
  normalizeMemberPreferences,
  type MemberPreferences
} from "./member/memberPreferencesApi";
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
  type CreateRecognizer
} from "./recognition/useCameraRecognition";
import {
  UNIVERSAL_RECOGNITION_RUNTIME,
  type RecognitionRuntimeConfiguration
} from "./recognition/recognitionRuntime";
import {
  createRecognitionHealthPreferenceStore,
  createRecognitionHealthSession,
  detectRecognitionHealthPlatform,
  submitRecognitionHealthSummary,
  type RecognitionHealthErrorFamily,
  type RecognitionHealthObservation,
  type RecognitionHealthPreferences,
  type RecognitionHealthTerminalOutcome,
  type SubmitRecognitionHealthSummary
} from "./recognitionHealth/recognitionHealth";

import "./styles.css";

type ExperienceMode = "welcome" | "camera" | "demo" | "manual";

function formatAllowanceRefresh(timestampMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestampMs));
}

function GuestCameraAllowanceNote({
  sourceCurrency,
  allowance
}: {
  sourceCurrency: SourceCurrencyCode;
  allowance: GuestCameraAllowanceSnapshot;
}) {
  const guestCameraCurrency = isGuestCameraCurrency(sourceCurrency);

  if (!guestCameraCurrency) {
    return (
      <aside className="camera-allowance-note" aria-label="Guest Camera Allowance">
        <strong>{sourceCurrency} uses Manual Price Entry for Guests.</strong>
        <p>Manual Price Entry is unlimited for every Source Currency.</p>
      </aside>
    );
  }

  if (allowance.isExhausted && allowance.nextRefreshAtMs !== null) {
    return (
      <aside
        className="camera-allowance-note exhausted"
        aria-label="Guest Camera Allowance"
      >
        <strong>Guest Camera Allowance used</strong>
        <p>
          {GUEST_CAMERA_USAGE_LIMIT} of {GUEST_CAMERA_USAGE_LIMIT} successful
          usages used. Camera refreshes at{" "}
          <time dateTime={new Date(allowance.nextRefreshAtMs).toISOString()}>
            {formatAllowanceRefresh(allowance.nextRefreshAtMs)}
          </time>
          . Manual Price Entry remains unlimited.
        </p>
      </aside>
    );
  }

  return (
    <aside className="camera-allowance-note" aria-label="Guest Camera Allowance">
      <strong>
        {allowance.remaining} of {GUEST_CAMERA_USAGE_LIMIT} successful camera
        usages remain in this browser.
      </strong>
      <p>
        A usage is charged only when a camera session produces its first Focused
        Price. Manual Price Entry remains unlimited.
      </p>
    </aside>
  );
}

function ManualPriceEntrySurface({
  preferences,
  isApprovedMember,
  memberAccessStatus,
  rates,
  onPreferencesChange,
  onClose,
  memberStatus,
  onContinueAsGuest
}: {
  preferences: ExperiencePreferences;
  isApprovedMember: boolean;
  memberAccessStatus: MemberAccessStatus;
  rates: GuestRateViews;
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
          <strong>Camera recognition is unavailable for this access mode.</strong>
          <p>
            {preferences.sourceCurrency} remains available through unlimited
            Manual Price Entry.
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
  createRecognizer = createBrowserRecognizer,
  recognitionRuntime = UNIVERSAL_RECOGNITION_RUNTIME,
  resolveCameraAccess = resolveFoundationCameraAccess,
  loadGuestRate,
  admission,
  memberSession = null,
  loadMemberPreferences = loadMemberPreferencesFromApi,
  saveMemberPreferences = saveMemberPreferencesToApi,
  submitRecognitionHealth = submitRecognitionHealthSummary,
  guestCameraAllowanceStore
}: {
  createRecognizer?: CreateRecognizer;
  recognitionRuntime?: RecognitionRuntimeConfiguration;
  resolveCameraAccess?: ResolveCameraAccess;
  loadGuestRate?: LoadGuestRate;
  admission?: ReactNode;
  memberSession?: MemberSession | null;
  loadMemberPreferences?: LoadMemberPreferences;
  saveMemberPreferences?: SaveMemberPreferences;
  submitRecognitionHealth?: SubmitRecognitionHealthSummary;
  guestCameraAllowanceStore?: GuestCameraAllowanceStore;
}) {
  const memberUserId = memberSession?.userId ?? null;
  const getMemberSessionToken = memberSession?.getSessionToken;
  const preferenceStoreRef = useRef(
    createGuestPreferenceStore(getBrowserStorage())
  );
  const defaultGuestCameraAllowanceStoreRef = useRef(
    createGuestCameraAllowanceStore({
      storage: getBrowserStorage(),
      lock: createWebLocksGuestCameraAllowanceLock(navigator.locks)
    })
  );
  const allowanceStore =
    guestCameraAllowanceStore ?? defaultGuestCameraAllowanceStoreRef.current;
  const [guestCameraAllowance, setGuestCameraAllowance] =
    useState<GuestCameraAllowanceSnapshot | null>(() =>
      memberUserId ? null : allowanceStore.getSnapshot()
    );
  const rateSnapshotStoreRef = useRef(
    createBrowserRateSnapshotStore(getBrowserStorage())
  );
  const recognitionHealthStoreRef = useRef(
    createRecognitionHealthPreferenceStore(getBrowserStorage())
  );
  const [recognitionHealthPreferences, setRecognitionHealthPreferences] =
    useState(() => recognitionHealthStoreRef.current.load());
  const recognitionHealthPreferencesRef = useRef(recognitionHealthPreferences);
  const [showRecognitionHealthInvitation, setShowRecognitionHealthInvitation] =
    useState(false);
  const [privacySettingsOpen, setPrivacySettingsOpen] = useState(false);
  const recognitionHealthSessionRef = useRef<
    ReturnType<typeof createRecognitionHealthSession> | null
  >(null);
  const updateRecognitionHealthPreferences = (
    next: RecognitionHealthPreferences
  ) => {
    recognitionHealthPreferencesRef.current = next;
    setRecognitionHealthPreferences(next);
    recognitionHealthStoreRef.current.save(next);
  };
  const changeRecognitionHealthSharing = (sharingEnabled: boolean) => {
    updateRecognitionHealthPreferences({
      sharingEnabled,
      invitationShown: true
    });
    setShowRecognitionHealthInvitation(false);
  };
  const finishRecognitionHealthSession = useCallback(
    (
      outcome: RecognitionHealthTerminalOutcome,
      errorFamily: RecognitionHealthErrorFamily
    ) => {
      const healthSession = recognitionHealthSessionRef.current;
      recognitionHealthSessionRef.current = null;
      if (!healthSession) return;
      void healthSession.finish(outcome, errorFamily);
      if (!recognitionHealthPreferencesRef.current.invitationShown) {
        const next = {
          ...recognitionHealthPreferencesRef.current,
          invitationShown: true
        };
        recognitionHealthPreferencesRef.current = next;
        setRecognitionHealthPreferences(next);
        recognitionHealthStoreRef.current.save(next);
        setShowRecognitionHealthInvitation(true);
      }
    },
    []
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
  const [memberAccessStatus, setMemberAccessStatus] = useState<
    MemberAccessStatus
  >(memberUserId ? "loading" : "guest");
  const [memberAccessAttempt, setMemberAccessAttempt] = useState(0);
  const [useGuestMode, setUseGuestMode] = useState(false);
  const [memberSaveStatus, setMemberSaveStatus] =
    useState<MemberSaveStatus>("idle");
  const [memberRateAuthorizationRevision, setMemberRateAuthorizationRevision] =
    useState(0);
  const memberSaveRef = useRef<AbortController | null>(null);
  const memberLoadGenerationRef = useRef(0);
  const memberSaveGenerationRef = useRef(0);
  const pendingMemberPreferencesRef = useRef<MemberPreferences | null>(null);
  useEffect(() => setUseGuestMode(false), [memberUserId]);
  useEffect(() => {
    const loadGeneration = memberLoadGenerationRef.current + 1;
    memberLoadGenerationRef.current = loadGeneration;
    memberSaveRef.current?.abort();
    memberSaveGenerationRef.current += 1;
    pendingMemberPreferencesRef.current = null;
    setMemberSaveStatus("idle");
    if (!memberUserId) {
      setMemberAccessStatus("guest");
      setMemberPreferences(null);
      return undefined;
    }
    const controller = new AbortController();
    setMemberAccessStatus("loading");
    setMemberPreferences(null);
    void loadMemberPreferences(memberUserId, controller.signal)
      .then(async (saved) => {
        if (
          controller.signal.aborted ||
          memberLoadGenerationRef.current !== loadGeneration
        ) {
          return;
        }
        const normalizedSaved = saved
          ? normalizeMemberPreferences(saved, memberUserId)
          : null;
        if (saved && !normalizedSaved) {
          throw new Error("Invalid synchronized member preferences.");
        }
        const restored =
          normalizedSaved ?? {
            ownerId: memberUserId,
            sourceCurrency: guestPreferences.sourceCurrency,
            targetCurrencies: [guestPreferences.targetCurrency],
            ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
          };
        const synchronized = normalizedSaved
          ? restored
          : await saveMemberPreferences(restored, controller.signal);
        if (
          controller.signal.aborted ||
          memberLoadGenerationRef.current !== loadGeneration
        ) {
          return;
        }
        const normalizedSynchronized = normalizeMemberPreferences(
          synchronized,
          memberUserId
        );
        if (!normalizedSynchronized) {
          throw new Error("Invalid saved member preferences.");
        }
        setMemberPreferences(normalizedSynchronized);
        setMemberAccessStatus("approved");
      })
      .catch((error: unknown) => {
        if (
          !controller.signal.aborted &&
          memberLoadGenerationRef.current === loadGeneration
        ) {
          setMemberAccessStatus(
            error instanceof MemberPreferencesRequestError &&
              error.kind === "inactive-membership"
              ? "inactive"
              : "unavailable"
          );
          setMemberPreferences(null);
        }
      });
    return () => {
      controller.abort();
      if (memberLoadGenerationRef.current === loadGeneration) {
        memberLoadGenerationRef.current += 1;
      }
    };
  }, [
    guestPreferences.sourceCurrency,
    guestPreferences.targetCurrency,
    loadMemberPreferences,
    memberAccessAttempt,
    memberUserId,
    saveMemberPreferences
  ]);
  const currentMemberPreferences =
    memberPreferences?.ownerId === memberUserId ? memberPreferences : null;
  const effectiveMemberAccessStatus =
    memberUserId &&
    memberAccessStatus === "approved" &&
    currentMemberPreferences === null
      ? "loading"
      : memberAccessStatus;
  const isApprovedMember =
    Boolean(memberUserId) &&
    !useGuestMode &&
    effectiveMemberAccessStatus === "approved" &&
    currentMemberPreferences !== null;
  const confirmationContextKey =
    memberUserId && !useGuestMode ? `member:${memberUserId}` : "guest";
  const shouldUseGuestCameraAllowance =
    !memberUserId ||
    useGuestMode ||
    effectiveMemberAccessStatus === "inactive";
  useEffect(() => {
    if (!shouldUseGuestCameraAllowance) {
      setGuestCameraAllowance(null);
      return undefined;
    }

    const refreshAllowance = () =>
      setGuestCameraAllowance(allowanceStore.getSnapshot());
    refreshAllowance();
    window.addEventListener("storage", refreshAllowance);
    return () => window.removeEventListener("storage", refreshAllowance);
  }, [allowanceStore, shouldUseGuestCameraAllowance]);
  useEffect(() => {
    if (
      !shouldUseGuestCameraAllowance ||
      guestCameraAllowance?.nextRefreshAtMs === null ||
      guestCameraAllowance?.nextRefreshAtMs === undefined
    ) {
      return undefined;
    }
    const refreshTimer = window.setTimeout(
      () => setGuestCameraAllowance(allowanceStore.getSnapshot()),
      Math.max(0, guestCameraAllowance.nextRefreshAtMs - Date.now())
    );
    return () => window.clearTimeout(refreshTimer);
  }, [allowanceStore, guestCameraAllowance, shouldUseGuestCameraAllowance]);
  const preferences: ExperiencePreferences = isApprovedMember
    ? {
        sourceCurrency: currentMemberPreferences.sourceCurrency,
        targetCurrencies: currentMemberPreferences.targetCurrencies,
        manualEntryPromotion: currentMemberPreferences.manualEntryPromotion,
        focusedPriceBehavior: currentMemberPreferences.focusedPriceBehavior
      }
    : {
        sourceCurrency: guestPreferences.sourceCurrency,
        targetCurrencies: [guestPreferences.targetCurrency],
        ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
      };
  const guestCameraAllowanceAvailable =
    guestCameraAllowance !== null && !guestCameraAllowance.isExhausted;
  const cameraAvailable = resolveCameraAccess({
    sourceCurrency: preferences.sourceCurrency,
    isApprovedMember,
    guestCameraAllowanceAvailable
  });
  const cameraSessionPolicyAvailable = resolveCameraAccess({
    sourceCurrency: preferences.sourceCurrency,
    isApprovedMember,
    guestCameraAllowanceAvailable: true
  });
  const sessionRef = useRef<CameraSession | null>(null);
  const cameraUsageSessionRef = useRef<CameraUsageSession | null>(null);
  const cameraUsageGenerationRef = useRef(0);
  useEffect(() => {
    cameraUsageGenerationRef.current += 1;
    cameraUsageSessionRef.current = null;
  }, [confirmationContextKey]);
  const [cameraSnapshot, setCameraSnapshot] = useState<CameraSnapshot>({
    status: "idle",
    stream: null
  });
  const [mode, setMode] = useState<ExperienceMode>("welcome");
  useEffect(() => {
    if (
      (mode === "camera" || mode === "demo") &&
      !cameraSessionPolicyAvailable
    ) {
      if (mode === "camera") {
        finishRecognitionHealthSession("closed-without-price", "none");
      }
      sessionRef.current?.stop();
      cameraUsageGenerationRef.current += 1;
      cameraUsageSessionRef.current = null;
      setMode("manual");
    }
  }, [cameraSessionPolicyAvailable, finishRecognitionHealthSession, mode]);
  useEffect(() => {
    rateSnapshotStoreRef.current.retainActivePairs(
      preferences.targetCurrencies.map((target) => ({
        source: preferences.sourceCurrency,
        target
      }))
    );
  }, [preferences.sourceCurrency, preferences.targetCurrencies]);
  const approvedMemberRateLoader = useMemo(
    () =>
      memberUserId && getMemberSessionToken
        ? createMemberRateLoader(memberUserId, getMemberSessionToken)
        : null,
    [getMemberSessionToken, memberUserId]
  );
  const baseRateLoader =
    loadGuestRate ??
    (isApprovedMember && approvedMemberRateLoader
      ? approvedMemberRateLoader
      : browserRateLoaderRef.current);
  const rates = useGuestRates(
    preferences.sourceCurrency,
    preferences.targetCurrencies,
    baseRateLoader,
    memberRateAuthorizationRevision
  );
  const displayedRates: GuestRateViews =
    isApprovedMember && memberSaveStatus === "saving"
      ? Object.fromEntries(
          preferences.targetCurrencies.map((target) => {
            const rate = rates[target];
            return [
              target,
              rate?.phase === "error" && rate.reason === "unauthorized"
                ? {
                    phase: "loading" as const,
                    rate: null,
                    error: null,
                    retry: rate.retry
                  }
                : rate
            ];
          })
        )
      : rates;

  useEffect(() => {
    const session = createCameraSession({
      mediaDevices: navigator.mediaDevices,
      document
    });
    sessionRef.current = session;
    const unsubscribe = session.subscribe(setCameraSnapshot);
    return () => {
      cameraUsageGenerationRef.current += 1;
      cameraUsageSessionRef.current = null;
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
    const saveGeneration = memberSaveGenerationRef.current + 1;
    memberSaveGenerationRef.current = saveGeneration;
    memberSaveRef.current = controller;
    setMemberSaveStatus("saving");
    void saveMemberPreferences(preferences, controller.signal)
      .then((saved) => {
        if (
          !controller.signal.aborted &&
          memberSaveGenerationRef.current === saveGeneration
        ) {
          const normalized = normalizeMemberPreferences(
            saved,
            preferences.ownerId
          );
          if (!normalized) {
            setMemberSaveStatus("error");
            return;
          }
          pendingMemberPreferencesRef.current = null;
          setMemberPreferences(normalized);
          setMemberRateAuthorizationRevision((revision) => revision + 1);
          setMemberSaveStatus("idle");
        }
      })
      .catch(() => {
        if (
          !controller.signal.aborted &&
          memberSaveGenerationRef.current === saveGeneration
        ) {
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
      !resolveCameraAccess({
        sourceCurrency: nextPreferences.sourceCurrency,
        isApprovedMember,
        guestCameraAllowanceAvailable
      })
    ) {
      sessionRef.current?.stop();
      cameraUsageGenerationRef.current += 1;
      cameraUsageSessionRef.current = null;
      setMode("manual");
    }
  };

  const startCamera = async () => {
    if (!cameraAvailable) {
      sessionRef.current?.stop();
      cameraUsageGenerationRef.current += 1;
      cameraUsageSessionRef.current = null;
      setMode("manual");
      return;
    }
    if (!cameraUsageSessionRef.current) {
      const generation = cameraUsageGenerationRef.current + 1;
      cameraUsageGenerationRef.current = generation;
      let usageSession: CameraUsageSession;
      usageSession = createCameraUsageSession(async () => {
        if (isApprovedMember) {
          return true;
        }
        const charge = await allowanceStore.recordSuccessfulUsage();
        if (
          cameraUsageGenerationRef.current !== generation ||
          cameraUsageSessionRef.current !== usageSession
        ) {
          return false;
        }
        setGuestCameraAllowance(charge.snapshot);
        if (!charge.charged) {
          finishRecognitionHealthSession("closed-without-price", "none");
          sessionRef.current?.stop();
          cameraUsageGenerationRef.current += 1;
          cameraUsageSessionRef.current = null;
          setMode("manual");
        }
        return charge.charged;
      });
      cameraUsageSessionRef.current = usageSession;
    }
    recognitionHealthSessionRef.current ??= createRecognitionHealthSession({
      consentAtStart: recognitionHealthPreferencesRef.current.sharingEnabled,
      isSharingEnabled: () =>
        recognitionHealthPreferencesRef.current.sharingEnabled,
      platform: detectRecognitionHealthPlatform(navigator.userAgent),
      sourceCurrency: preferences.sourceCurrency,
      startedAtMs: performance.now(),
      submit: submitRecognitionHealth
    });
    setMode("camera");
    await sessionRef.current?.start();
  };

  const openDemo = () => {
    sessionRef.current?.stop();
    cameraUsageGenerationRef.current += 1;
    cameraUsageSessionRef.current = null;
    setMode(
      cameraAvailable || effectiveMemberAccessStatus === "loading"
        ? "demo"
        : "manual"
    );
  };

  const closeExperience = (
    outcome?: RecognitionHealthTerminalOutcome,
    errorFamily: RecognitionHealthErrorFamily = "none"
  ) => {
    finishRecognitionHealthSession(
      outcome ?? "closed-without-price",
      errorFamily
    );
    sessionRef.current?.stop();
    cameraUsageGenerationRef.current += 1;
    cameraUsageSessionRef.current = null;
    setMode("welcome");
  };
  const recordFocusedPrice = useCallback(() => {
    void cameraUsageSessionRef.current?.observeFocusedPrice(true);
  }, []);
  const recordRecognitionHealth = useCallback(
    (observation: RecognitionHealthObservation) => {
      recognitionHealthSessionRef.current?.record(observation);
    },
    []
  );
  const handlePlaybackError = useCallback(() => {
    sessionRef.current?.interrupt();
  }, []);
  const memberStatus = (
    <MemberStatusPanel
      accessStatus={
        useGuestMode ? "guest-choice" : effectiveMemberAccessStatus
      }
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
        memberAccessStatus={effectiveMemberAccessStatus}
        rates={displayedRates}
        onPreferencesChange={updatePreferences}
        onClose={closeExperience}
        memberStatus={memberStatus}
        onContinueAsGuest={() => setUseGuestMode(true)}
      />
    );
  }

  if (
    mode !== "welcome" &&
    cameraSessionPolicyAvailable
  ) {
    return (
      <LiveCameraWorkspace
        demo={mode === "demo"}
        snapshot={cameraSnapshot}
        preferences={{
          ...preferences,
          sourceCurrency: preferences.sourceCurrency
        }}
        isApprovedMember={isApprovedMember}
        usingGuestMode={useGuestMode}
        memberAccessStatus={effectiveMemberAccessStatus}
        rates={displayedRates}
        onPreferencesChange={updatePreferences}
        recognitionRuntime={recognitionRuntime}
        createRecognizer={createRecognizer}
        onStop={() => sessionRef.current?.stop()}
        onClose={closeExperience}
        onRetry={startCamera}
        onPlaybackError={handlePlaybackError}
        memberSaveStatus={memberSaveStatus}
        onRetryMemberAccess={() =>
          setMemberAccessAttempt((attempt) => attempt + 1)
        }
        onRetryMemberSave={() => {
          if (pendingMemberPreferencesRef.current) {
            persistMemberPreferences(pendingMemberPreferencesRef.current);
          }
        }}
        onContinueAsGuest={() => setUseGuestMode(true)}
        onRecognitionHealthRecord={recordRecognitionHealth}
        recognitionHealthPreferences={recognitionHealthPreferences}
        privacySettingsOpen={privacySettingsOpen}
        onRecognitionHealthChange={changeRecognitionHealthSharing}
        onOpenPrivacySettings={() => setPrivacySettingsOpen(true)}
        onClosePrivacySettings={() => setPrivacySettingsOpen(false)}
        onFocusedPrice={recordFocusedPrice}
        confirmationContextKey={confirmationContextKey}
      />
    );
  }

  const failure =
    cameraSnapshot.status !== "idle" &&
    isCameraFailureStatus(cameraSnapshot.status)
      ? statusContent[cameraSnapshot.status]
      : undefined;
  const guestCameraCurrency = isGuestCameraCurrency(
    preferences.sourceCurrency
  );
  const guestAllowanceExhausted =
    !isApprovedMember &&
    guestCameraCurrency &&
    guestCameraAllowance?.isExhausted === true;

  return (
    <main className="welcome-shell">
      <nav className="topbar" aria-label="Primary">
        <TagLingoMark />
        <span className="guest-badge">
          {isApprovedMember
            ? "Approved Member mode"
            : effectiveMemberAccessStatus === "loading" && memberUserId
              ? CHECKING_MEMBER_ACCESS_LABEL
              : effectiveMemberAccessStatus === "unavailable"
                ? "Member access unavailable"
                : effectiveMemberAccessStatus === "inactive"
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
              {cameraAvailable
                ? "Before we ask for camera access"
                : "Manual Price Entry is ready"}
            </h2>
            {cameraAvailable ? (
              <p>
                The rear camera helps you point naturally at retail price tags.
                Camera frames stay on this device and are never uploaded.
              </p>
            ) : (
              <p>
                Camera recognition is unavailable for this access mode. You
                can still enter a price without granting camera access.
              </p>
            )}
          </div>
        </div>

        <CurrencySettings
          preferences={preferences}
          onChange={updatePreferences}
          isApprovedMember={isApprovedMember}
          memberAccessStatus={effectiveMemberAccessStatus}
        />
        {isApprovedMember ? (
          <RecognitionExperienceSettings
            preferences={preferences}
            onChange={updatePreferences}
          />
        ) : null}
        {!isApprovedMember && guestCameraAllowance ? (
          <GuestCameraAllowanceNote
            sourceCurrency={preferences.sourceCurrency}
            allowance={guestCameraAllowance}
          />
        ) : null}
        {memberStatus}

        <RecognitionHealthPrivacy
          preferences={recognitionHealthPreferences}
          invitation={showRecognitionHealthInvitation}
          settingsOpen={privacySettingsOpen}
          onChange={changeRecognitionHealthSharing}
          onDismissInvitation={() => setShowRecognitionHealthInvitation(false)}
          onCloseSettings={() => setPrivacySettingsOpen(false)}
        />

        {failure ? (
          <div className="failure-card" role="alert">
            <strong>{failure.title}</strong>
            <p>{failure.detail}</p>
          </div>
        ) : null}

        <div className="primary-actions">
          {guestAllowanceExhausted ? (
            <>
              <button className="primary-button" type="button" disabled>
                <span className="button-camera" aria-hidden="true" />
                Open camera · allowance used
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setMode("manual")}
              >
                Enter price manually · unlimited
              </button>
            </>
          ) : (
            <button className="primary-button" type="button" onClick={startCamera}>
              <span
                className={cameraAvailable ? "button-camera" : "button-manual"}
                aria-hidden="true"
              />
              {cameraAvailable ? "Open camera" : "Enter price manually"}
              <span aria-hidden="true">→</span>
            </button>
          )}
          {(cameraAvailable || effectiveMemberAccessStatus === "loading") &&
          preferences.sourceCurrency === "JPY" ? (
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
          Manual Price Entry is universal. Camera Recognition uses one shared,
          browser-local runtime with the selected Source Currency's notation
          rules.
        </p>
        {cameraAvailable ? (
          <p>Recognition limitations are handled through Manual Price Entry.</p>
        ) : null}
        <button
          className="text-button"
          type="button"
          onClick={() => setPrivacySettingsOpen(true)}
        >
          Privacy settings
        </button>
      </footer>
    </main>
  );
}
