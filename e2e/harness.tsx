import { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import App from "../src/App";
import { CameraWorkspace } from "../src/camera/CameraWorkspaceView";
import type {
  CameraWorkspaceActions,
  CameraWorkspaceBindings,
  CameraWorkspaceState
} from "../src/camera/cameraWorkspace";
import type { CurrencyCode } from "../src/domain/currencies";
import type { GuestReferenceRate } from "../src/fx/referenceRate";
import {
  DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS,
  type MemberPreferences
} from "../src/member/memberPreferencesApi";
import { MemberPreferencesRequestError } from "../src/member/memberPreferencesClient";
import {
  createBrowserRecognizer,
  type CreateRecognizer
} from "../src/recognition/useCameraRecognition";
import {
  createCandidateTracker,
  type CandidateTrackingSnapshot
} from "../src/recognition/focusTracker";
import type { DetectedPrice } from "../src/recognition/priceLocalization";
import { createTestRecognitionProfile } from "../src/test/recognitionProfile";
import { createCameraWorkspaceFixtureState } from "../src/test/cameraWorkspaceFixture";

const searchParameters = new URLSearchParams(window.location.search);

function fixtureRate(
  source: CurrencyCode,
  target: CurrencyCode
): GuestReferenceRate {
  return {
    source,
    target,
    direction: "source-to-target",
    value:
      target === "USD" ? "0.0067123" : target === "TWD" ? "0.22" : "0.0058",
    provider: "Frankfurter",
    method: "daily-blend",
    providerPublishedDate: "2026-07-30",
    fetchedAt: "2026-07-30T10:00:00.000Z",
    state: "fresh",
    attribution: "Frankfurter · deterministic browser fixture"
  };
}

const loadRate = async (source: CurrencyCode, target: CurrencyCode) => {
  if (searchParameters.get("rate") === "missing" && target === "EUR") {
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    throw new Error("rate unavailable");
  }
  return fixtureRate(source, target);
};

function injectedWorkspaceState(): CameraWorkspaceState {
  return createCameraWorkspaceFixtureState(fixtureRate("JPY", "USD"));
}

function DeterministicCameraWorkspace({
  startPaused = false,
  currencyJourney = false,
  overlapPrices = false,
  initialManualEntryExpanded = true,
  compactStatus = null
}: {
  startPaused?: boolean;
  currencyJourney?: boolean;
  overlapPrices?: boolean;
  initialManualEntryExpanded?: boolean;
  compactStatus?: "held" | "requesting" | null;
}) {
  const [state, setState] = useState(() => {
    const baseFocusedState = injectedWorkspaceState();
    const overlapDetectedPrices = baseFocusedState.recognition.detectedPrices.map(
      (price, index) => ({
        ...price,
        box:
          index === 0
            ? { x: 480, y: 350, width: 30, height: 20 }
            : { x: 517, y: 358, width: 4, height: 4 }
      })
    );
    const focusedState = overlapPrices
      ? {
          ...baseFocusedState,
          recognition: {
            ...baseFocusedState.recognition,
            detectedPrices: overlapDetectedPrices
          },
          focusedPrice: overlapDetectedPrices[0]
        }
      : baseFocusedState;
    const initialState = currencyJourney
      ? {
          ...focusedState,
          shopperAccess: {
            ...focusedState.shopperAccess,
            status: "approved" as const,
            isApprovedMember: true
          }
        }
      : focusedState;
    const stateWithManualEntry = {
      ...initialState,
      manualPriceEntry: {
        ...initialState.manualPriceEntry,
        expanded: initialManualEntryExpanded
      }
    };
    if (compactStatus === "held") {
      const heldPrice = {
        ...stateWithManualEntry.recognition.detectedPrices[0],
        state: "held" as const
      };
      return {
        ...stateWithManualEntry,
        demo: false,
        recognition: {
          ...stateWithManualEntry.recognition,
          phase: "focused" as const,
          detectedPrices: [
            heldPrice,
            ...stateWithManualEntry.recognition.detectedPrices.slice(1)
          ]
        },
        focusedPrice: heldPrice
      };
    }
    if (compactStatus === "requesting") {
      return {
        ...stateWithManualEntry,
        demo: false,
        camera: { status: "requesting" as const, stream: null },
        recognition: {
          ...stateWithManualEntry.recognition,
          phase: "waiting" as const
        },
        focusedPrice: null
      };
    }
    return startPaused
      ? {
          ...stateWithManualEntry,
          demo: false,
          camera: { status: "idle" as const, stream: null },
          recognition: {
            ...initialState.recognition,
            phase: "waiting" as const,
            detectedPrices: [],
            explicitlyFocusedPriceIdentity: null
          },
          focusedPrice: null,
          priceSelection: {
            enteredPriceInUse: false,
            focusedPriceConfirmed: false
          }
        }
      : stateWithManualEntry;
  });
  const [leftWorkspace, setLeftWorkspace] = useState(false);
  const actions: CameraWorkspaceActions = {
    startCamera: () => {
      const focusedState = injectedWorkspaceState();
      setState((current) => ({
        ...current,
        camera: { status: "active", stream: null },
        recognition: focusedState.recognition,
        focusedPrice: focusedState.focusedPrice,
        priceSelection: focusedState.priceSelection
      }));
    },
    stopCamera: () =>
      setState((current) => ({
        ...current,
        camera: { status: "idle", stream: null }
      })),
    selectPrice: (identity) =>
      setState((current) => ({
        ...current,
        recognition: {
          ...current.recognition,
          explicitlyFocusedPriceIdentity: identity
        },
        focusedPrice:
          current.recognition.detectedPrices.find(
            (price) => price.identity === identity
          ) ?? current.focusedPrice,
        priceSelection: {
          ...current.priceSelection,
          focusedPriceConfirmed: true
        }
      })),
    resumeAutomaticFocus: () =>
      setState((current) => ({
        ...current,
        recognition: {
          ...current.recognition,
          explicitlyFocusedPriceIdentity: null
        },
        focusedPrice: current.recognition.detectedPrices[0] ?? null
      })),
    clearHeldPrices: () =>
      setState((current) => {
        const detectedPrices = current.recognition.detectedPrices.filter(
          ({ state: evidenceState }) => evidenceState !== "held"
        );
        const affectedLock = current.recognition.detectedPrices.some(
          ({ identity, state: evidenceState }) =>
            evidenceState === "held" &&
            identity === current.recognition.explicitlyFocusedPriceIdentity
        );
        return {
          ...current,
          recognition: {
            ...current.recognition,
            detectedPrices,
            explicitlyFocusedPriceIdentity: affectedLock
              ? null
              : current.recognition.explicitlyFocusedPriceIdentity
          },
          focusedPrice: affectedLock
            ? detectedPrices.find(({ state: evidenceState }) => evidenceState === "fresh") ?? null
            : current.focusedPrice?.state === "held"
              ? null
              : current.focusedPrice
        };
      }),
    changeCurrencies: (currencies) => {
      const loadingRates = Object.fromEntries(
        currencies.targetCurrencies.map((target) => [
          target,
          { phase: "loading" as const, rate: null, error: null }
        ])
      );
      setState((current) => ({
        ...current,
        currencies,
        enteredPrice: null,
        focusedPrice: current.focusedPrice
          ? { ...current.focusedPrice, currency: currencies.sourceCurrency }
          : null,
        recognition: {
          ...current.recognition,
          detectedPrices: current.recognition.detectedPrices.map((price) => ({
            ...price,
            currency: currencies.sourceCurrency
          }))
        },
        referenceRates: loadingRates,
        priceSelection: {
          enteredPriceInUse: false,
          focusedPriceConfirmed: current.focusedPrice !== null
        }
      }));
      window.setTimeout(() => {
        setState((current) => {
          if (
            current.currencies.sourceCurrency !== currencies.sourceCurrency ||
            current.currencies.targetCurrencies.join(",") !==
              currencies.targetCurrencies.join(",")
          ) {
            return current;
          }
          return {
            ...current,
            referenceRates: Object.fromEntries(
              currencies.targetCurrencies.map((target) => [
                target,
                currencies.sourceCurrency === "USD" && target === "JPY"
                  ? {
                      phase: "error" as const,
                      rate: null,
                      error: "A validated Reference Rate is unavailable.",
                      reason: "unavailable" as const
                    }
                  : {
                      phase: "ready" as const,
                      rate: fixtureRate(currencies.sourceCurrency, target),
                      error: null
                    }
              ])
            )
          };
        });
      }, 150);
    },
    changeExperiencePreferences: (experiencePreferences) =>
      setState((current) => ({ ...current, experiencePreferences })),
    enterPrice: (enteredPrice) =>
      setState((current) => ({
        ...current,
        enteredPrice,
        priceSelection: {
          ...current.priceSelection,
          enteredPriceInUse: enteredPrice !== null
        }
      })),
    setManualPriceEntryExpanded: (expanded) =>
      setState((current) => ({
        ...current,
        manualPriceEntry: { ...current.manualPriceEntry, expanded }
      })),
    useEnteredPrice: () =>
      setState((current) => ({
        ...current,
        priceSelection: {
          ...current.priceSelection,
          enteredPriceInUse: true
        }
      })),
    useFocusedPrice: () =>
      setState((current) => ({
        ...current,
        priceSelection: {
          enteredPriceInUse: false,
          focusedPriceConfirmed: true
        }
      })),
    retryRecognition: () =>
      setState((current) => ({
        ...current,
        recognition: { ...current.recognition, phase: "searching" }
      })),
    retryReferenceRate: () => undefined,
    leaveWorkspace: () => setLeftWorkspace(true),
    continueAsGuest: () => undefined,
    retryMemberAccess: () => undefined,
    retryMemberSave: () => undefined,
    changeRecognitionHealthSharing: (sharingEnabled) =>
      setState((current) => ({
        ...current,
        recognitionHealth: {
          ...current.recognitionHealth,
          preferences: {
            sharingEnabled,
            invitationShown: true
          }
        }
      })),
    openPrivacySettings: () =>
      setState((current) => ({
        ...current,
        recognitionHealth: {
          ...current.recognitionHealth,
          settingsOpen: true
        }
      })),
    closePrivacySettings: () =>
      setState((current) => ({
        ...current,
        recognitionHealth: {
          ...current.recognitionHealth,
          settingsOpen: false
        }
      }))
  };
  const bindings: CameraWorkspaceBindings = {
    connectPreview: () => undefined,
    connectVideo: () => undefined,
    connectCaptureGuide: () => undefined,
    reportPlaybackError: () => undefined
  };

  return leftWorkspace ? (
    <main>
      <h1>Camera Workspace left</h1>
      <p role="status">
        {state.camera.status === "idle"
          ? "Camera stopped"
          : "Camera still running"}
      </p>
    </main>
  ) : (
    <CameraWorkspace state={state} actions={actions} bindings={bindings} />
  );
}

function DeterministicEvidenceLifecycleWorkspace() {
  const profile = createTestRecognitionProfile();
  const tracker = useRef(
    createCandidateTracker({
      captureGuide: { x: 280, y: 384, width: 440, height: 132 },
      geometry: profile.geometry,
      stabilization: profile.stabilization
    })
  ).current;
  const price: DetectedPrice = {
    currency: "JPY",
    minorUnits: 4_142,
    confidence: 96,
    box: { x: 420, y: 410, width: 160, height: 80 }
  };
  const coverage = { x: 0, y: 0, width: 1_000, height: 1_000 };
  const frame = useRef(0);
  const [state, setState] = useState(() =>
    createCameraWorkspaceFixtureState(fixtureRate("JPY", "USD"), {
      recognition: {
        phase: "searching",
        progress: 1,
        candidateOutlines: [],
        detectedPrices: [],
        explicitlyFocusedPriceIdentity: null
      },
      focusedPrice: null,
      priceSelection: {
        enteredPriceInUse: false,
        focusedPriceConfirmed: false
      }
    })
  );
  const publish = (snapshot: CandidateTrackingSnapshot) => {
    const detectedPrices = snapshot.detectedPrices;
    const focusedPrice = snapshot.focusedPrice;
    setState((current) => ({
      ...current,
      recognition: {
        phase: focusedPrice
          ? "focused"
          : snapshot.candidateOutlines.length > 0
            ? "stabilizing"
            : "searching",
        progress: 1,
        candidateOutlines: snapshot.candidateOutlines,
        detectedPrices,
        explicitlyFocusedPriceIdentity: snapshot.explicitlyFocusedPriceIdentity
      },
      focusedPrice,
      priceSelection: {
        ...current.priceSelection,
        focusedPriceConfirmed: focusedPrice !== null
      }
    }));
  };
  const observe = (candidates: readonly DetectedPrice[]) => {
    frame.current += 1;
    publish(
      tracker.observe({
        frameIdentity: `lifecycle-frame-${frame.current.toString()}`,
        kind: "guide",
        candidates,
        coverage,
        observedAtMs: frame.current * 100
      })
    );
  };
  const actions: CameraWorkspaceActions = {
    startCamera: () => undefined,
    stopCamera: () => undefined,
    selectPrice: (identity) => publish(tracker.select(identity)),
    resumeAutomaticFocus: () => publish(tracker.resumeAutomaticFocus()),
    clearHeldPrices: () => publish(tracker.clearHeldPrices()),
    changeCurrencies: () => undefined,
    changeExperiencePreferences: () => undefined,
    enterPrice: () => undefined,
    setManualPriceEntryExpanded: () => undefined,
    useEnteredPrice: () => undefined,
    useFocusedPrice: () => undefined,
    retryRecognition: () => undefined,
    retryReferenceRate: () => undefined,
    leaveWorkspace: () => undefined,
    continueAsGuest: () => undefined,
    retryMemberAccess: () => undefined,
    retryMemberSave: () => undefined,
    changeRecognitionHealthSharing: () => undefined,
    openPrivacySettings: () => undefined,
    closePrivacySettings: () => undefined
  };
  const bindings: CameraWorkspaceBindings = {
    connectPreview: () => undefined,
    connectVideo: () => undefined,
    connectCaptureGuide: () => undefined,
    reportPlaybackError: () => undefined
  };

  return (
    <>
      <CameraWorkspace state={state} actions={actions} bindings={bindings} />
      <aside aria-label="Evidence fixture controls">
        <button type="button" onClick={() => observe([price])}>
          Observe credible evidence
        </button>
        <button type="button" onClick={() => observe([price])}>
          Corroborate or reacquire
        </button>
        <button type="button" onClick={() => observe([])}>
          Covered miss
        </button>
      </aside>
    </>
  );
}

const createFixtureRecognizer: CreateRecognizer = (_runtime, onProgress) => ({
  async prepare() {
    if (searchParameters.get("preparation") === "failed") {
      throw new Error("Deterministic recognition preparation failure");
    }
    if (searchParameters.get("preparation") === "delayed") {
      onProgress(0.25, "holding deterministic preparation fixture");
      await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    }
    onProgress(1, "deterministic browser fixture ready");
  },
  async recognize(image, passIdentity) {
    const frameNumber = Number.parseInt(
      passIdentity.frameIdentity.match(/frame-(\d+)$/u)?.[1] ?? "0",
      10
    );
    const wobble = searchParameters.get("performance") === "warm"
      ? [-2, 1, -1, 2][frameNumber % 4]
      : 0;
    const scale = passIdentity.preprocessingIdentity === "raw" ? 1 : 2;
    const canvas = image as HTMLCanvasElement;
    const sourceWidth = canvas.width / scale;
    const sourceHeight = canvas.height / scale;
    const primaryBox = {
      x: (sourceWidth - 160) / 2 + wobble,
      y: (sourceHeight - 80) / 2 - wobble,
      width: 160,
      height: 80
    };
    const alternateBox = {
      x: Math.max(20, sourceWidth * 0.16),
      y: Math.max(20, sourceHeight * 0.72),
      width: 140,
      height: 72
    };
    const observations = searchParameters.get("performance") === "warm"
      ? passIdentity.kind === "guide"
        ? [
            { text: "4,142円", box: primaryBox },
            { text: "980円", box: alternateBox }
          ]
        : []
      : passIdentity.kind === "discovery"
        ? [
            {
              text: "980円",
              box: alternateBox
            }
          ]
        : [{ text: "4,142円", box: primaryBox }];
    return observations.map(({ text, box }) => {
      const scaledBox = {
        x: box.x * scale,
        y: box.y * scale,
        width: box.width * scale,
        height: box.height * scale
      };
      return {
        text,
        evidenceKind: "text",
        confidence: 96,
        box: scaledBox,
        polygon: [
          { x: scaledBox.x, y: scaledBox.y },
          { x: scaledBox.x + scaledBox.width, y: scaledBox.y },
          {
            x: scaledBox.x + scaledBox.width,
            y: scaledBox.y + scaledBox.height
          },
          { x: scaledBox.x, y: scaledBox.y + scaledBox.height }
        ],
        timing: { startedAtMs: 1, completedAtMs: 2, durationMs: 1 },
        passIdentity
      };
    });
  },
  async terminate() {}
});
const memberPreferences: MemberPreferences = {
  ownerId: "user_browser_fixture",
  sourceCurrency: "JPY",
  targetCurrencies: ["USD", "TWD", "EUR"],
  ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
};
const MEMBER_ACCESS_FIXTURES = [
  "approved",
  "loading",
  "inactive",
  "unavailable"
] as const;
type MemberAccessFixture = (typeof MEMBER_ACCESS_FIXTURES)[number];

const memberPreferenceLoaders: Record<
  MemberAccessFixture,
  () => Promise<MemberPreferences | null>
> = {
  approved: async () => memberPreferences,
  loading: () => new Promise<MemberPreferences | null>(() => undefined),
  inactive: async () => {
    throw new MemberPreferencesRequestError(
      "inactive-membership",
      "Deterministic inactive membership"
    );
  },
  unavailable: async () => {
    throw new Error("Deterministic member service failure");
  }
};

function isMemberAccessFixture(
  value: string | null
): value is MemberAccessFixture {
  return MEMBER_ACCESS_FIXTURES.includes(value as MemberAccessFixture);
}

function MemberAppFixture({
  access,
  createRecognizer
}: {
  access: MemberAccessFixture;
  createRecognizer: CreateRecognizer;
}) {
  const [signedIn, setSignedIn] = useState(true);
  const [savedChanges, setSavedChanges] = useState(0);
  const loadMemberPreferences = useCallback(
    () => memberPreferenceLoaders[access](),
    [access]
  );
  const saveMemberPreferences = useCallback(
    async (preferences: MemberPreferences) => {
      setSavedChanges((count) => count + 1);
      return preferences;
    },
    []
  );

  return (
    <>
      <App
        memberSession={
          signedIn
            ? {
                userId: memberPreferences.ownerId,
                getSessionToken: async () => "deterministic-session-token"
              }
            : null
        }
        loadMemberPreferences={loadMemberPreferences}
        saveMemberPreferences={saveMemberPreferences}
        loadGuestRate={loadRate}
        createRecognizer={createRecognizer}
      />
      {signedIn ? (
        <aside
          aria-label="Fixture account"
          style={{ position: "fixed", right: 0, bottom: 0, zIndex: 10_000 }}
        >
          <button type="button" onClick={() => setSignedIn(false)}>
            Sign out fixture account
          </button>
          <output
            role="status"
            aria-label="Member preference synchronization"
          >
            {savedChanges} saved {savedChanges === 1 ? "change" : "changes"}
          </output>
        </aside>
      ) : null}
    </>
  );
}

const memberMode = searchParameters.get("mode") === "member";
const memberAccessParameter = searchParameters.get("access");
const memberAccess: MemberAccessFixture =
  isMemberAccessFixture(memberAccessParameter)
    ? memberAccessParameter
    : "approved";
const workspaceMode = searchParameters.get("workspace");
const selectedRecognizer = searchParameters.get("preparation") === "first-use"
  ? createBrowserRecognizer
  : createFixtureRecognizer;
createRoot(document.getElementById("root")!).render(
  workspaceMode === "lifecycle" ? (
    <DeterministicEvidenceLifecycleWorkspace />
  ) : workspaceMode === "focused" ||
    workspaceMode === "journey" ||
    workspaceMode === "currencies" ||
    workspaceMode === "overlap" ||
    workspaceMode === "responsive" ||
    workspaceMode === "responsive-held" ||
    workspaceMode === "responsive-requesting" ? (
    <DeterministicCameraWorkspace
      startPaused={workspaceMode === "journey"}
      currencyJourney={workspaceMode === "currencies"}
      overlapPrices={workspaceMode === "overlap"}
      initialManualEntryExpanded={!workspaceMode?.startsWith("responsive")}
      compactStatus={
        workspaceMode === "responsive-held"
          ? "held"
          : workspaceMode === "responsive-requesting"
            ? "requesting"
            : null
      }
    />
  ) : memberMode ? (
    <MemberAppFixture
      access={memberAccess}
      createRecognizer={selectedRecognizer}
    />
  ) : (
    <App
      loadGuestRate={loadRate}
      createRecognizer={selectedRecognizer}
      admission={
        <section aria-label="Fixture member admission">
          <button type="button">Request fixture member access</button>
        </section>
      }
    />
  )
);
