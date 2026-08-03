import {
  formatCurrencyMinorUnits
} from "../domain/currencies";
import type { RecognitionView } from "./useCameraRecognition";

export function RecognitionSummary({
  recognition,
  demo
}: {
  recognition: RecognitionView;
  demo: boolean;
}) {
  const focusedLabel = recognition.focusedPrice
    ? `Focused Price · ${recognition.focusedPrice.currency} ${formatCurrencyMinorUnits(
        recognition.focusedPrice.minorUnits,
        recognition.focusedPrice.currency
      )}`
    : demo
      ? "No Focused Price yet"
      : "No Detected Price yet";
  const guidance = recognition.focusedPrice
    ? "Two compatible observations matched the exact price-token rectangle."
    : demo || recognition.phase === "stabilizing"
      ? "Hold steady while the current observation is checked for stability."
      : "Place one price inside the Capture Guide, improve the lighting, or move closer.";

  return (
    <section className="recognition-note" aria-label="Recognition summary">
      <span aria-hidden="true">⌁</span>
      <div>
        <p className="recognition-focus">
          <strong>{focusedLabel}</strong>
        </p>
        <p>{guidance}</p>
      </div>
    </section>
  );
}
