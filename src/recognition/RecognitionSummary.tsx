import {
  currencyFractionDigits,
  type CurrencyCode
} from "../domain/currencies";
import type { RecognitionView } from "./useCameraRecognition";

function formatDetectedAmount(
  minorUnits: number,
  currency: CurrencyCode
): string {
  const fractionDigits = currencyFractionDigits(currency);
  return (minorUnits / 10 ** fractionDigits).toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  });
}

export function RecognitionSummary({
  recognition,
  demo
}: {
  recognition: RecognitionView;
  demo: boolean;
}) {
  const focusedLabel = recognition.focusedPrice
    ? `Focused Price · ${recognition.focusedPrice.currency} ${formatDetectedAmount(
        recognition.focusedPrice.minorUnits,
        recognition.focusedPrice.currency
      )}`
    : demo
      ? "No Focused Price yet"
      : "No Detected Price yet";
  const guidance = recognition.focusedPrice
    ? "Two compatible observations matched the exact price-token rectangle."
    : demo
      ? "The recorded observation is being checked twice for stability."
      : "Hold steady, improve the lighting, or move closer to the price tag.";

  return (
    <section className="recognition-note" aria-label="Recognition summary">
      <span aria-hidden="true">⌁</span>
      <div>
        <p className="recognition-focus">
          <strong aria-live="polite" aria-atomic="true">
            {focusedLabel}
          </strong>
        </p>
        {recognition.detectedPrices.length > 0 ? (
          <details className="detected-price-summary">
            <summary>
              View {recognition.detectedPrices.length.toLocaleString("en-US")}{" "}
              {recognition.detectedPrices.length === 1
                ? "Detected Price"
                : "Detected Prices"}
            </summary>
            <ul>
              {recognition.detectedPrices.map((price) => (
                <li key={`${price.minorUnits}-${price.box.x}-${price.box.y}`}>
                  {recognition.focusedPrice === price
                    ? "Focused detection"
                    : "Detected Price"}{" "}
                  · {price.currency}{" "}
                  {formatDetectedAmount(price.minorUnits, price.currency)}
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p>0 Detected Prices.</p>
        )}
        <p>{guidance}</p>
      </div>
    </section>
  );
}
