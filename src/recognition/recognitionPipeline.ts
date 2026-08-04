import type { SourceCurrencyCode } from "../domain/currencies";
import type {
  OcrRecognizer,
  RecognitionPassIdentity,
  RecognizerObservation
} from "./ocrRecognizer";
import {
  preprocessRecognitionFrame,
  type PreprocessedRecognitionFrame
} from "./preprocessing";
import {
  createPriceEvidenceConfiguration,
  fusePriceEvidence,
  type PriceEvidenceCandidate
} from "./priceEvidence";
import type { RecognitionRuntimeConfiguration } from "./recognitionRuntime";

type FramePassIdentity = Pick<
  RecognitionPassIdentity,
  "kind" | "frameIdentity"
>;

type PreprocessRecognitionFrame = (
  frame: HTMLCanvasElement,
  portfolio: RecognitionRuntimeConfiguration["preprocessing"]
) => PreprocessedRecognitionFrame[];

function normalizeGeometry(
  observation: RecognizerObservation,
  variant: PreprocessedRecognitionFrame,
  passIdentity: FramePassIdentity
): RecognizerObservation {
  const scale = variant.coordinateScale;
  const scalePoint = ({ x, y }: RecognizerObservation["polygon"][number]) => ({
    x: x / scale,
    y: y / scale
  });
  const [topLeft, topRight, bottomRight, bottomLeft] = observation.polygon;
  return {
    ...observation,
    box: {
      x: observation.box.x / scale,
      y: observation.box.y / scale,
      width: observation.box.width / scale,
      height: observation.box.height / scale
    },
    polygon: [
      scalePoint(topLeft),
      scalePoint(topRight),
      scalePoint(bottomRight),
      scalePoint(bottomLeft)
    ],
    passIdentity: {
      ...passIdentity,
      preprocessingIdentity: variant.identity
    }
  };
}

export async function recognizePriceEvidence(
  runtime: RecognitionRuntimeConfiguration,
  sourceCurrency: SourceCurrencyCode,
  recognizer: OcrRecognizer,
  frame: HTMLCanvasElement,
  passIdentity: FramePassIdentity,
  {
    preprocess = preprocessRecognitionFrame
  }: { preprocess?: PreprocessRecognitionFrame } = {}
): Promise<PriceEvidenceCandidate[]> {
  const observations: RecognizerObservation[] = [];
  const variants = preprocess(frame, runtime.preprocessing);

  for (const variant of variants) {
    const variantPassIdentity: RecognitionPassIdentity = {
      ...passIdentity,
      preprocessingIdentity: variant.identity
    };
    const recognized = await recognizer.recognize(
      variant.image,
      variantPassIdentity
    );
    observations.push(
      ...recognized.map((observation) =>
        normalizeGeometry(observation, variant, passIdentity)
      )
    );
  }

  return fusePriceEvidence(
    createPriceEvidenceConfiguration(sourceCurrency, runtime.rules),
    observations
  );
}
