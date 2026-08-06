import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  DetectedPriceIdentity,
  PriceEvidenceTrackIdentity,
  TrackedDetectedPrice
} from "./focusTracker";
import { CameraExperienceOverlay } from "./CameraExperience";
import type { RecognitionController } from "./useCameraRecognition";

function identity(value: string): DetectedPriceIdentity {
  return value as DetectedPriceIdentity;
}

function candidateIdentity(value: string): PriceEvidenceTrackIdentity {
  return value as PriceEvidenceTrackIdentity;
}

const firstPrice: TrackedDetectedPrice = {
  identity: identity("price-one"),
  currency: "JPY",
  minorUnits: 4142,
  confidence: 96,
  state: "fresh",
  box: { x: 40, y: 50, width: 120, height: 60 }
};
const secondPrice: TrackedDetectedPrice = {
  identity: identity("price-two"),
  currency: "JPY",
  minorUnits: 980,
  confidence: 92,
  state: "fresh",
  box: { x: 220, y: 280, width: 100, height: 50 }
};

function recognition(
  overrides: Partial<RecognitionController> = {}
): RecognitionController {
  return {
    phase: "searching",
    progress: 1,
    candidateOutlines: [],
    detectedPrices: [],
    focusedPrice: null,
    explicitlyFocusedPriceIdentity: null,
    completedPassCount: 0,
    missCount: 0,
    focusChangeCount: 0,
    stableDetectionCount: 0,
    selectDetectedPrice: vi.fn(),
    resumeAutomaticFocus: vi.fn(),
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

  it("shows provisional geometry as a silent, inert Possible price outline", () => {
    render(
      <CameraExperienceOverlay
        demo={false}
        recognition={recognition({
          phase: "stabilizing",
          candidateOutlines: [
            {
              identity: candidateIdentity("candidate-one"),
              state: "candidate",
              label: "Possible price",
              box: firstPrice.box,
              expiresAtMs: 1_500
            }
          ]
        })}
        onCaptureGuideReady={() => undefined}
      />
    );

    expect(screen.getByText("Stabilizing")).toBeInTheDocument();
    expect(screen.getByText("Hold steady")).toBeInTheDocument();
    expect(document.querySelector("[data-detected-price]")).toBeNull();
    const candidateOutline = document.querySelector(
      "[data-candidate-outline]"
    )!;
    expect(candidateOutline).toHaveTextContent("Possible price");
    expect(candidateOutline).toHaveAttribute("aria-hidden", "true");
    expect(candidateOutline.tagName).toBe("DIV");
    expect(candidateOutline).not.toHaveAttribute("tabindex");
    expect(candidateOutline).not.toHaveTextContent("4,142");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("visibly labels a held Detected Price without moving its geometry", () => {
    render(
      <CameraExperienceOverlay
        demo={false}
        recognition={recognition({
          phase: "focused",
          candidateOutlines: [],
          detectedPrices: [{ ...firstPrice, state: "held" }],
          focusedPrice: { ...firstPrice, state: "held" }
        })}
        onCaptureGuideReady={() => undefined}
      />
    );

    const held = document.querySelector('[data-evidence-state="held"]')!;
    expect(held).toHaveClass("held-detection");
    expect(held).toHaveTextContent("Held");
    expect(held).toHaveStyle({
      left: "40px",
      top: "50px",
      width: "120px",
      height: "60px"
    });
    expect(held.tagName).toBe("DIV");
  });

  it("keeps the centered Focus Target inert during automatic focus", () => {
    render(
      <CameraExperienceOverlay
        demo={false}
        recognition={recognition({
          phase: "focused",
          detectedPrices: [firstPrice],
          focusedPrice: firstPrice
        })}
        onCaptureGuideReady={() => undefined}
      />
    );

    const target = document.querySelector("[data-focus-target]")!;
    expect(target.tagName).toBe("DIV");
    expect(target).toHaveAttribute("aria-hidden", "true");
    expect(target).toHaveAttribute("data-focus-mode", "automatic");
    expect(screen.queryByRole("button", { name: /resume automatic focus/i }))
      .not.toBeInTheDocument();
  });

  it("turns the Focus Target into an enabled Resume control while explicitly locked", async () => {
    const user = userEvent.setup();
    const resumeAutomaticFocus = vi.fn();
    render(
      <CameraExperienceOverlay
        demo={false}
        recognition={recognition({
          phase: "focused",
          detectedPrices: [firstPrice, secondPrice],
          focusedPrice: secondPrice,
          explicitlyFocusedPriceIdentity: secondPrice.identity,
          resumeAutomaticFocus
        })}
        onCaptureGuideReady={() => undefined}
      />
    );

    const target = screen.getByRole("button", {
      name: /resume automatic focus/i
    });
    expect(target).toBeEnabled();
    expect(target).toHaveAttribute("data-focus-mode", "paused");
    expect(target).toHaveClass("paused-focus-target");

    await user.click(target);
    expect(resumeAutomaticFocus).toHaveBeenCalledOnce();
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

  it("lets shoppers lock a fresh Detection Outline outside automatic focus", async () => {
    const user = userEvent.setup();
    const selectDetectedPrice = vi.fn();
    render(
      <CameraExperienceOverlay
        demo={false}
        recognition={recognition({
          phase: "searching",
          detectedPrices: [secondPrice],
          selectDetectedPrice
        })}
        onCaptureGuideReady={() => undefined}
      />
    );

    const outline = document.querySelector(
      '[data-detected-price="JPY-980"]'
    )!;
    expect(outline).toHaveAttribute("data-evidence-state", "fresh");
    await user.click(outline);
    expect(selectDetectedPrice).toHaveBeenCalledWith(secondPrice.identity);
  });
});
