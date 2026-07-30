const MINIMUM_DELAY_MS = 250;
const MAXIMUM_DELAY_MS = 1_000;

export function nextRecognitionDelay(ocrDurationMs: number): number {
  return Math.min(
    MAXIMUM_DELAY_MS,
    Math.max(MINIMUM_DELAY_MS, Math.round(ocrDurationMs / 2))
  );
}
