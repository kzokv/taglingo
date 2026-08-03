import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  DetectedPriceIdentity,
  TrackedDetectedPrice
} from "./focusTracker";
import {
  CameraExperienceOverlay,
  DetectedPriceRail
} from "./CameraExperience";
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

  it("makes outlines and the Detected Price rail independently operable", async () => {
    const user = userEvent.setup();
    const selectDetectedPrice = vi.fn();
    const controller = recognition({
      phase: "focused",
      detectedPrices: [firstPrice, secondPrice],
      focusedPrice: firstPrice,
      selectDetectedPrice
    });
    render(
      <>
        <CameraExperienceOverlay
          demo={false}
          recognition={controller}
          onCaptureGuideReady={() => undefined}
        />
        <DetectedPriceRail recognition={controller} />
      </>
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
    expect(focusedOutline).toHaveAccessibleName(
      "Focused Price Detection Outline · JPY 4,142"
    );
    expect(otherOutline).toHaveAccessibleName(
      "Detected Price Detection Outline · JPY 980"
    );

    await user.tab();
    expect(
      screen.getByRole("button", {
        name: "Focused Price Detection Outline · JPY 4,142"
      })
    ).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("button", {
        name: "Detected Price Detection Outline · JPY 980"
      })
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(selectDetectedPrice).toHaveBeenLastCalledWith(secondPrice.identity);

    await user.click(otherOutline);
    expect(selectDetectedPrice).toHaveBeenLastCalledWith(secondPrice.identity);

    const rail = screen.getByRole("region", { name: "Detected Price rail" });
    expect(rail).toBeInTheDocument();
    const railItem = screen.getByRole("button", {
      name: "Select Detected Price 2 of 2 · JPY 980"
    });
    await user.click(railItem);
    expect(selectDetectedPrice).toHaveBeenLastCalledWith(secondPrice.identity);
  });
});
