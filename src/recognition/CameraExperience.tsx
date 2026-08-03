import { formatCurrencyMinorUnits } from "../domain/currencies";
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
  const displayedPrices =
    recognition.phase === "focused" ? recognition.detectedPrices : [];

  return (
    <div className="focus-stage">
      {demo ? (
        <div className="demo-tag">
          <span className="demo-kicker">税込価格</span>
          <strong>4,142円</strong>
          <small>travel notebook</small>
        </div>
      ) : null}
      {displayedPrices.map((price) => {
        const focused = isFocusedPrice(recognition, price.identity);
        return (
          <button
            key={price.identity}
            className={`detected-price ${focused ? "focused-detection" : ""}`}
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
            type="button"
            aria-label={`${focused ? "Focused Price" : "Detected Price"} Detection Outline · ${price.currency} ${formatCurrencyMinorUnits(price.minorUnits, price.currency)}`}
            data-detected-price={`${price.currency}-${price.minorUnits}`}
            data-detected-price-identity={price.identity}
            onClick={() => recognition.selectDetectedPrice(price.identity)}
          >
            <span aria-hidden="true">{focused ? "Focused" : "Detected"}</span>
          </button>
        );
      })}
      <div
        ref={onCaptureGuideReady}
        className="capture-guide"
        aria-hidden="true"
        data-recognition-phase={recognition.phase}
      >
        <div className="capture-guide-label">
          <span>{content.state}</span>
          <strong>{content.instruction}</strong>
          <small>Capture Guide · recognition region</small>
        </div>
        <i />
        <i />
        <i />
        <i />
        <p>{content.detail}</p>
      </div>
    </div>
  );
}

export function DetectedPriceRail({
  recognition
}: {
  recognition: RecognitionController;
}) {
  if (recognition.phase !== "focused" || recognition.detectedPrices.length < 2) {
    return null;
  }

  return (
    <section className="detected-price-rail" aria-label="Detected Price rail">
      <div>
        <strong>Detected Prices</strong>
        <span>Select a price · your selection stays focused</span>
      </div>
      <ul className="detected-price-rail-list">
        {recognition.detectedPrices.map((price, index) => {
          const focused = isFocusedPrice(recognition, price.identity);
          return (
            <li key={price.identity}>
              <button
                className={focused ? "is-selected" : ""}
                type="button"
                aria-current={focused ? "true" : undefined}
                aria-label={`Select Detected Price ${index + 1} of ${recognition.detectedPrices.length} · ${price.currency} ${formatCurrencyMinorUnits(price.minorUnits, price.currency)}`}
                data-detected-price-rail-item={`${price.currency}-${price.minorUnits}`}
                onClick={() => recognition.selectDetectedPrice(price.identity)}
              >
                <span>
                  {price.currency}{" "}
                  {formatCurrencyMinorUnits(price.minorUnits, price.currency)}
                </span>
                <small>{focused ? "Focused" : "Choose"}</small>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
