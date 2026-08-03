import {
  isComparisonProfileEligible,
  type JpyComparisonProfile
} from "./comparisonProfiles";
import {
  createOcrRecognizer,
  verifyRecognitionAssets,
  type OcrRecognizer
} from "./ocrRecognizer";
import { createPaddleOcrRecognizer } from "./paddleOcrRecognizer";

export type CreateComparisonRecognizer = (
  profile: JpyComparisonProfile
) => OcrRecognizer;

function defaultCreateRecognizer(
  profile: JpyComparisonProfile
): OcrRecognizer {
  return profile.recognition.recognizer.engine === "paddleocr.js"
    ? createPaddleOcrRecognizer(profile)
    : createOcrRecognizer(profile.recognition, {
        verifyAssets: () => verifyRecognitionAssets(profile.assets)
      });
}

export function createComparisonTrial({
  createRecognizer = defaultCreateRecognizer
}: {
  createRecognizer?: CreateComparisonRecognizer;
} = {}) {
  let resident: OcrRecognizer | null = null;
  let failed = false;
  let ended = false;

  return {
    async start(profile: JpyComparisonProfile): Promise<OcrRecognizer> {
      if (failed) {
        throw new Error(
          "A failed profile ends this trial; another engine will not be loaded."
        );
      }
      if (ended) {
        throw new Error("The comparison trial has ended.");
      }
      if (resident) {
        throw new Error("A comparison profile is already resident.");
      }
      if (!isComparisonProfileEligible(profile)) {
        throw new Error(`Comparison profile ${profile.id} exceeds its budget.`);
      }

      const selected = createRecognizer(profile);
      resident = selected;
      try {
        await selected.prepare();
        return selected;
      } catch (error) {
        failed = true;
        resident = null;
        await selected.terminate().catch(() => undefined);
        throw error;
      }
    },

    async terminate(): Promise<void> {
      ended = true;
      const selected = resident;
      resident = null;
      await selected?.terminate();
    }
  };
}
