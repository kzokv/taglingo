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
      {displayedPrices.map((price) => {
        const focused = isFocusedPrice(recognition, price.identity);
        return (
          <button
            key={price.identity}
            className={`detected-price ${
              price.state === "held" ? "held-detection" : ""
            } ${focused ? "focused-detection" : ""}`}
            style={outlineStyle(price.box)}
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            data-detected-price={`${price.currency}-${price.minorUnits}`}
            data-detected-price-identity={price.identity}
            data-evidence-state={price.state}
            onClick={() => recognition.selectDetectedPrice(price.identity)}
          >
            <span aria-hidden="true">
              {price.state === "held"
                ? "Held"
                : focused
                  ? "Focused"
                  : "Detected"}
            </span>
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
