import { useRef, useState } from "react";
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
import type { CreateRecognizer } from "../src/recognition/useCameraRecognition";
import {
  createCandidateTracker,
  type CandidateTrackingSnapshot
} from "../src/recognition/focusTracker";
import type { DetectedPrice } from "../src/recognition/priceLocalization";
import { createTestRecognitionProfile } from "../src/test/recognitionProfile";
import { createCameraWorkspaceFixtureState } from "../src/test/cameraWorkspaceFixture";

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

const loadRate = async (source: CurrencyCode, target: CurrencyCode) =>
  fixtureRate(source, target);

function injectedWorkspaceState(): CameraWorkspaceState {
  return createCameraWorkspaceFixtureState(fixtureRate("JPY", "USD"));
}

function DeterministicCameraWorkspace() {
  const [state, setState] = useState(injectedWorkspaceState);
  const [leftWorkspace, setLeftWorkspace] = useState(false);
  const actions: CameraWorkspaceActions = {
    startCamera: () =>
      setState((current) => ({
        ...current,
        camera: { status: "active", stream: null }
      })),
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
    changeCurrencies: (currencies) =>
      setState((current) => ({ ...current, currencies })),
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
    </main>
  ) : (
    <CameraWorkspace state={state} actions={actions} bindings={bindings} />
  );
}

function DeterministicEvidenceLifecycleWorkspace() {
  const profile = createTestRecognitionProfile();
  const tracker = useRef(
    createCandidateTracker({
      captureGuideCenter: { x: 500, y: 450 },
      geometry: profile.geometry,
      stabilization: profile.stabilization
    })
  ).current;
  const price: DetectedPrice = {
    currency: "JPY",
    minorUnits: 4_142,
    confidence: 96,
    box: { x: 400, y: 320, width: 160, height: 80 }
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
    onProgress(1, "deterministic browser fixture ready");
  },
  async recognize(_image, passIdentity) {
    const primaryBox = { x: 592, y: 111, width: 160, height: 80 };
    const observations =
      passIdentity.kind === "discovery"
        ? [
            {
              text: "980円",
              box: { x: 220, y: 720, width: 140, height: 72 }
            }
          ]
        : [{ text: "4,142円", box: primaryBox }];
    const scale = passIdentity.preprocessingIdentity === "raw" ? 1 : 2;
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
const searchParameters = new URLSearchParams(window.location.search);
const memberMode = searchParameters.get("mode") === "member";
const workspaceMode = searchParameters.get("workspace");
createRoot(document.getElementById("root")!).render(
  workspaceMode === "lifecycle" ? (
    <DeterministicEvidenceLifecycleWorkspace />
  ) : workspaceMode === "focused" ? (
    <DeterministicCameraWorkspace />
  ) : memberMode ? (
    <App
      memberSession={{
        userId: memberPreferences.ownerId,
        getSessionToken: async () => "deterministic-session-token"
      }}
      loadMemberPreferences={async () => memberPreferences}
      saveMemberPreferences={async (preferences) => preferences}
      loadGuestRate={loadRate}
      createRecognizer={createFixtureRecognizer}
      admission={
        <section aria-label="Fixture account">
          <button type="button">Sign out fixture account</button>
        </section>
      }
    />
  ) : (
    <App
      loadGuestRate={loadRate}
      createRecognizer={createFixtureRecognizer}
      admission={
        <section aria-label="Fixture member admission">
          <button type="button">Request fixture member access</button>
        </section>
      }
    />
  )
);
