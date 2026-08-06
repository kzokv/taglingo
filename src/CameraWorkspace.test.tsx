import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CameraWorkspace } from "./camera/CameraWorkspaceView";
import type {
  CameraWorkspaceActions,
  CameraWorkspaceBindings,
  CameraWorkspaceState
} from "./camera/cameraWorkspace";
import type { GuestReferenceRate } from "./fx/referenceRate";
import {
  CAMERA_WORKSPACE_FIXTURE_PRICES,
  createCameraWorkspaceFixtureState
} from "./test/cameraWorkspaceFixture";

const referenceRate: GuestReferenceRate = {
  source: "JPY",
  target: "USD",
  direction: "source-to-target",
  value: "0.0067123",
  provider: "Frankfurter",
  method: "daily-blend",
  providerPublishedDate: "2026-07-30",
  fetchedAt: "2026-07-30T10:00:00.000Z",
  state: "fresh",
  attribution: "Frankfurter · deterministic workspace fixture"
};
const [focusedPrice, otherPrice] = CAMERA_WORKSPACE_FIXTURE_PRICES;

function workspaceState(
  overrides: Partial<CameraWorkspaceState> = {}
): CameraWorkspaceState {
  return createCameraWorkspaceFixtureState(referenceRate, overrides);
}

function workspaceActions(): CameraWorkspaceActions {
  return {
    startCamera: vi.fn(),
    stopCamera: vi.fn(),
    selectPrice: vi.fn(),
    resumeAutomaticFocus: vi.fn(),
    changeCurrencies: vi.fn(),
    changeExperiencePreferences: vi.fn(),
    enterPrice: vi.fn(),
    setManualPriceEntryExpanded: vi.fn(),
    useEnteredPrice: vi.fn(),
    useFocusedPrice: vi.fn(),
    retryRecognition: vi.fn(),
    retryReferenceRate: vi.fn(),
    leaveWorkspace: vi.fn(),
    continueAsGuest: vi.fn(),
    retryMemberAccess: vi.fn(),
    retryMemberSave: vi.fn(),
    changeRecognitionHealthSharing: vi.fn(),
    openPrivacySettings: vi.fn(),
    closePrivacySettings: vi.fn()
  };
}

function workspaceBindings(): CameraWorkspaceBindings {
  return {
    connectPreview: vi.fn(),
    connectVideo: vi.fn(),
    connectCaptureGuide: vi.fn(),
    reportPlaybackError: vi.fn()
  };
}

describe("Camera Workspace boundary", () => {
  it("renders injected state and routes shopper changes through one action boundary", async () => {
    const user = userEvent.setup();
    const state = workspaceState();
    const actions = workspaceActions();

    render(
      <CameraWorkspace
        state={state}
        actions={actions}
        bindings={workspaceBindings()}
      />
    );

    expect(
      screen.getByRole("region", { name: /recognition summary/i })
    ).toHaveTextContent("Focused Price · JPY 4,142");
    expect(screen.getByText("USD 27.80")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /price 2 of 2, jpy 980/i })
    );
    expect(actions.selectPrice).toHaveBeenCalledWith(otherPrice.identity);

    await user.selectOptions(
      screen.getByRole("combobox", { name: /source currency/i }),
      "AUD"
    );
    expect(actions.changeCurrencies).toHaveBeenCalledWith({
      sourceCurrency: "AUD",
      targetCurrencies: ["USD"]
    });

    const composer = screen.getByRole("region", {
      name: /manual price entry/i
    });
    await user.type(
      within(composer).getByRole("textbox", { name: /jpy amount/i }),
      "5,000"
    );
    await user.click(
      within(composer).getByRole("button", {
        name: /convert entered price/i
      })
    );
    expect(actions.enterPrice).toHaveBeenCalledWith({
      provenance: "entered",
      currency: "JPY",
      minorUnits: 5_000,
      displayAmount: "5,000"
    });

    await user.click(screen.getByRole("button", { name: /close camera/i }));
    expect(actions.stopCamera).toHaveBeenCalledOnce();
    expect(actions.leaveWorkspace).toHaveBeenCalledOnce();
  });

  it("starts the camera through the same boundary after injected failure", () => {
    const actions = workspaceActions();
    render(
      <CameraWorkspace
        state={workspaceState({
          demo: false,
          camera: { status: "denied", stream: null },
          recognition: {
            ...workspaceState().recognition,
            phase: "waiting",
            detectedPrices: []
          },
          focusedPrice: null,
          manualPriceEntry: { expanded: true, wasPromoted: true }
        })}
        actions={actions}
        bindings={workspaceBindings()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /try camera again/i }));
    expect(actions.startCamera).toHaveBeenCalledOnce();
  });

  it("routes Resume automatic focus through the workspace action boundary", async () => {
    const user = userEvent.setup();
    const actions = workspaceActions();

    render(
      <CameraWorkspace
        state={workspaceState()}
        actions={actions}
        bindings={workspaceBindings()}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /resume automatic focus/i })
    );
    expect(actions.resumeAutomaticFocus).toHaveBeenCalledOnce();
  });

  it("discloses secondary Reference Rate details without displacing the Focused Price conversion", async () => {
    const user = userEvent.setup();

    render(
      <CameraWorkspace
        state={workspaceState()}
        actions={workspaceActions()}
        bindings={workspaceBindings()}
      />
    );

    const conversion = screen.getByRole("region", {
      name: /focused price conversion/i
    });
    expect(within(conversion).getByText("USD 27.80")).toBeVisible();
    expect(
      within(conversion).getByText("1 JPY = 0.0067123 USD")
    ).not.toBeVisible();

    await user.click(
      within(conversion).getByText(/about this estimate/i)
    );
    expect(
      within(conversion).getByText("1 JPY = 0.0067123 USD")
    ).toBeVisible();
  });

  it.each([
    {
      condition: "camera denial",
      camera: { status: "denied" as const, stream: null },
      phase: "waiting" as const
    },
    {
      condition: "camera interruption",
      camera: { status: "interrupted" as const, stream: null },
      phase: "waiting" as const
    },
    {
      condition: "Recognition Runtime preparation",
      camera: { status: "active" as const, stream: null },
      phase: "preparing" as const
    },
    {
      condition: "recognition failure",
      camera: { status: "active" as const, stream: null },
      phase: "error" as const
    },
    {
      condition: "ordinary searching",
      camera: { status: "active" as const, stream: null },
      phase: "searching" as const
    }
  ])("keeps Manual Price Entry operable during $condition", async ({
    camera,
    phase
  }) => {
    const user = userEvent.setup();
    const actions = workspaceActions();

    render(
      <CameraWorkspace
        state={workspaceState({
          demo: false,
          camera,
          recognition: {
            ...workspaceState().recognition,
            phase,
            progress: phase === "preparing" ? 0.4 : 1,
            detectedPrices: []
          },
          focusedPrice: null,
          manualPriceEntry: { expanded: false, wasPromoted: false },
          priceSelection: {
            enteredPriceInUse: false,
            focusedPriceConfirmed: false
          }
        })}
        actions={actions}
        bindings={workspaceBindings()}
      />
    );

    expect(screen.getByLabelText(/recognition status/i)).toBeVisible();
    const composer = screen.getByRole("region", {
      name: /^manual price entry$/i
    });
    const openManualEntry = within(composer).getByRole("button", {
      name: /open manual price entry/i
    });
    expect(openManualEntry).toBeEnabled();
    expect(composer).toHaveTextContent("Available anytime");

    await user.click(openManualEntry);
    expect(actions.setManualPriceEntryExpanded).toHaveBeenCalledWith(true);
  });
});
