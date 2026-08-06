import { useRef, type MouseEvent as ReactMouseEvent } from "react";

import type {
  RecognitionController,
  RecognitionPhase
} from "./useCameraRecognition";

interface GuideContent {
  state: string;
  instruction: string;
  detail: string;
}

function guideContent(
  phase: RecognitionPhase,
  detectedPriceCount: number
): GuideContent {
  switch (phase) {
    case "preparing":
      return {
        state: "Preparing",
        instruction: "Getting recognition ready",
        detail: "Manual Price Entry remains available below."
      };
    case "searching":
      return {
        state: "Searching",
        instruction: "Place one price inside the Capture Guide",
        detail:
          "Improve the lighting or move closer if the price stays unclear."
      };
    case "stabilizing":
      return {
        state: "Stabilizing",
        instruction: "Hold steady",
        detail: "The same price is being checked again before it is shown."
      };
    case "focused":
      return detectedPriceCount > 1
        ? {
            state: `Focused · ${detectedPriceCount.toLocaleString("en-US")} found`,
            instruction: "Select another Detection Outline",
            detail:
              "Your explicit selection stays focused while it remains stable."
          }
        : {
            state: "Focused",
            instruction: "Price confirmed",
            detail: "The stronger Detection Outline marks the Focused Price."
          };
    case "error":
      return {
        state: "Recognition paused",
        instruction: "Use Manual Price Entry below",
        detail: "Camera recognition can be prepared again when you are ready."
      };
    case "waiting":
      return {
        state: "Camera starting",
        instruction: "Keep one price near the centered target",
        detail: "Manual Price Entry remains available below."
      };
  }
}

function isFocusedPrice(
  recognition: RecognitionController,
  identity: RecognitionController["detectedPrices"][number]["identity"]
) {
  return recognition.focusedPrice?.identity === identity;
}

export function CameraExperienceOverlay({
  demo,
  recognition,
  onCaptureGuideReady
}: {
  demo: boolean;
  recognition: RecognitionController;
  onCaptureGuideReady: (element: HTMLDivElement | null) => void;
}) {
  const content = guideContent(
    recognition.phase,
    recognition.detectedPrices.length
  );
  const displayedPrices = recognition.detectedPrices;
  const outlineRefs = useRef(new Map<string, HTMLElement>());
  const hitRegionRefs = useRef(new Map<string, HTMLElement>());
  const outlineStyle = (box: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) =>
    demo
      ? {
          left: `${box.x / 10}%`,
          top: `${box.y / 10}%`,
          width: `${box.width / 10}%`,
          height: `${box.height / 10}%`
        }
      : {
          left: box.x,
          top: box.y,
          width: box.width,
          height: box.height
        };
  const hitRegionStyle = (box: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) =>
    demo
      ? {
          left: `${(box.x + box.width / 2) / 10}%`,
          top: `${(box.y + box.height / 2) / 10}%`,
          width: `max(${box.width / 10}%, 44px)`,
          height: `max(${box.height / 10}%, 44px)`
        }
      : {
          left: box.x + box.width / 2,
          top: box.y + box.height / 2,
          width: Math.max(box.width, 44),
          height: Math.max(box.height, 44)
        };
  const selectAtPointer = (event: ReactMouseEvent<HTMLElement>) => {
    const point = { x: event.clientX, y: event.clientY };
    const freshPrices = displayedPrices.filter(({ state }) => state === "fresh");
    const measuredOutlines = freshPrices.map((price) => ({
      price,
      bounds: outlineRefs.current.get(price.identity)?.getBoundingClientRect()
    }));
    if (
      measuredOutlines.every(
        ({ bounds }) => !bounds || (bounds.width === 0 && bounds.height === 0)
      )
    ) {
      const identity = event.currentTarget.dataset
        .detectedPriceIdentity as (typeof freshPrices)[number]["identity"];
      if (identity) recognition.selectDetectedPrice(identity);
      return;
    }
    const contains = (rect: DOMRect) =>
      point.x >= rect.left &&
      point.x <= rect.right &&
      point.y >= rect.top &&
      point.y <= rect.bottom;
    const inExpandedRegion = freshPrices.filter((price) => {
      const region = hitRegionRefs.current.get(price.identity);
      return region ? contains(region.getBoundingClientRect()) : false;
    });
    const inVisibleOutline = inExpandedRegion.filter((price) => {
      const outline = outlineRefs.current.get(price.identity);
      return outline ? contains(outline.getBoundingClientRect()) : false;
    });
    const candidates =
      inVisibleOutline.length > 0 ? inVisibleOutline : inExpandedRegion;
    const selected = [...candidates].sort((left, right) => {
      const leftBounds = outlineRefs.current
        .get(left.identity)
        ?.getBoundingClientRect();
      const rightBounds = outlineRefs.current
        .get(right.identity)
        ?.getBoundingClientRect();
      const distanceFromPoint = (bounds: DOMRect | undefined) => {
        if (!bounds) return Number.POSITIVE_INFINITY;
        const x = bounds.left + bounds.width / 2 - point.x;
        const y = bounds.top + bounds.height / 2 - point.y;
        return x * x + y * y;
      };
      return (
        distanceFromPoint(leftBounds) - distanceFromPoint(rightBounds) ||
        left.box.y - right.box.y ||
        left.box.x - right.box.x ||
        left.identity.localeCompare(right.identity)
      );
    })[0];
    if (selected) recognition.selectDetectedPrice(selected.identity);
  };

  return (
    <div className="focus-stage">
      {demo ? (
        <div className="demo-tag">
          <span className="demo-kicker">税込価格</span>
          <strong>4,142円</strong>
          <small>travel notebook</small>
        </div>
      ) : null}
      {recognition.candidateOutlines.map((candidate) => (
        <div
          key={candidate.identity}
          className="candidate-outline"
          style={outlineStyle(candidate.box)}
          aria-hidden="true"
          data-candidate-outline={candidate.identity}
          data-evidence-state="candidate"
        >
          <span aria-hidden="true">{candidate.label}</span>
        </div>
      ))}
      {displayedPrices
        .filter(({ state }) => state === "fresh")
        .map((price) => (
          <div
            key={`hit-${price.identity}`}
            ref={(element) => {
              if (element) {
                hitRegionRefs.current.set(price.identity, element);
              } else {
                hitRegionRefs.current.delete(price.identity);
              }
            }}
            className="detected-price-hit-region"
            style={hitRegionStyle(price.box)}
            aria-hidden="true"
            tabIndex={-1}
            data-outline-hit-region={price.identity}
            data-detected-price-identity={price.identity}
            onClick={selectAtPointer}
          />
        ))}
      {displayedPrices.map((price) => {
        const focused = isFocusedPrice(recognition, price.identity);
        const className = `detected-price ${
          price.state === "held" ? "held-detection" : ""
        } ${focused ? "focused-detection" : ""}`;
        const label = price.state === "held"
          ? "Held"
          : focused
            ? "Focused"
            : "Detected";
        const sharedProps = {
          className,
          style: outlineStyle(price.box),
          "aria-hidden": true as const,
          "data-detected-price": `${price.currency}-${price.minorUnits}`,
          "data-detected-price-identity": price.identity,
          "data-evidence-state": price.state
        };
        return price.state === "held" ? (
          <div key={price.identity} {...sharedProps}>
            <span aria-hidden="true">{label}</span>
          </div>
        ) : (
          <button
            key={price.identity}
            ref={(element) => {
              if (element) {
                outlineRefs.current.set(price.identity, element);
              } else {
                outlineRefs.current.delete(price.identity);
              }
            }}
            {...sharedProps}
            type="button"
            tabIndex={-1}
            onClick={selectAtPointer}
          >
            <span aria-hidden="true">{label}</span>
          </button>
        );
      })}
      <div
        ref={onCaptureGuideReady}
        className="capture-guide"
        role="region"
        aria-label="Capture Guide"
        data-recognition-phase={recognition.phase}
      >
        <div className="capture-guide-label" aria-hidden="true">
          <span>{content.state}</span>
          <strong>{content.instruction}</strong>
          <small>Capture Guide · recognition region</small>
        </div>
        {recognition.explicitlyFocusedPriceIdentity ? (
          <button
            className="focus-target paused-focus-target"
            type="button"
            aria-label="Resume automatic focus"
            data-focus-target=""
            data-focus-mode="paused"
            onClick={recognition.resumeAutomaticFocus}
          >
            <span aria-hidden="true">Ⅱ</span>
          </button>
        ) : (
          <div
            className="focus-target"
            aria-hidden="true"
            data-focus-target=""
            data-focus-mode="automatic"
          />
        )}
        <i aria-hidden="true" />
        <i aria-hidden="true" />
        <i aria-hidden="true" />
        <i aria-hidden="true" />
        <p aria-hidden="true">{content.detail}</p>
      </div>
    </div>
  );
}
