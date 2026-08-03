import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  DetectedPriceIdentity,
  TrackedDetectedPrice
} from "./focusTracker";
import { CameraExperienceOverlay } from "./CameraExperience";
import type { RecognitionController } from "./useCameraRecognition";

function identity(value: string): DetectedPriceIdentity {
  return value as DetectedPriceIdentity;
}

const firstPrice: TrackedDetectedPrice = {
  identity: identity("price-one"),
  currency: "JPY",
  minorUnits: 4142,
  confidence: 96,
  box: { x: 40, y: 50, width: 120, height: 60 }
};
const secondPrice: TrackedDetectedPrice = {
  identity: identity("price-two"),
  currency: "JPY",
  minorUnits: 980,
  confidence: 92,
  box: { x: 220, y: 280, width: 100, height: 50 }
};

function recognition(
  overrides: Partial<RecognitionController> = {}
): RecognitionController {
  return {
    phase: "searching",
    progress: 1,
    detectedPrices: [],
    focusedPrice: null,
    explicitlyFocusedPriceIdentity: null,
    selectDetectedPrice: vi.fn(),
    ...overrides
  };
}

describe("guided camera presenter", () => {
  it("uses the Capture Guide for actionable Searching guidance without outlines", () => {
    render(
      <CameraExperienceOverlay
        demo={false}
        recognition={recognition()}
        onCaptureGuideReady={() => undefined}
      />
    );

    expect(screen.getByText("Searching")).toBeInTheDocument();
    expect(
      screen.getByText("Place one price inside the Capture Guide")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/improve the lighting or move closer/i)
    ).toBeInTheDocument();
    expect(document.querySelector("[data-detected-price]")).toBeNull();
  });

  it("says Hold steady through the Capture Guide and suppresses provisional geometry", () => {
    render(
      <CameraExperienceOverlay
        demo={false}
        recognition={recognition({
          phase: "stabilizing",
          detectedPrices: [firstPrice]
        })}
        onCaptureGuideReady={() => undefined}
      />
    );

    expect(screen.getByText("Stabilizing")).toBeInTheDocument();
    expect(screen.getByText("Hold steady")).toBeInTheDocument();
    expect(document.querySelector("[data-detected-price]")).toBeNull();
  });

  it("keeps visual outlines pointer-operable but out of the accessibility tree", async () => {
    const user = userEvent.setup();
    const selectDetectedPrice = vi.fn();
    const controller = recognition({
      phase: "focused",
      detectedPrices: [firstPrice, secondPrice],
      focusedPrice: firstPrice,
      selectDetectedPrice
    });
    render(
      <CameraExperienceOverlay
        demo={false}
        recognition={controller}
        onCaptureGuideReady={() => undefined}
      />
    );

    const focusedOutline = document.querySelector(
      '[data-detected-price="JPY-4142"]'
    )!;
    const otherOutline = document.querySelector(
      '[data-detected-price="JPY-980"]'
    )!;
    expect(focusedOutline).toHaveClass("focused-detection");
    expect(focusedOutline).toHaveTextContent("Focused");
    expect(otherOutline).not.toHaveClass("focused-detection");
    expect(otherOutline).toHaveTextContent("Detected");
    expect(focusedOutline).toHaveAttribute("aria-hidden", "true");
    expect(focusedOutline).toHaveAttribute("tabindex", "-1");
    expect(otherOutline).toHaveAttribute("aria-hidden", "true");
    expect(otherOutline).toHaveAttribute("tabindex", "-1");
    expect(screen.queryAllByRole("button")).toHaveLength(0);

    await user.click(otherOutline);
    expect(selectDetectedPrice).toHaveBeenLastCalledWith(secondPrice.identity);
  });
});
