import type { SourceCurrencyCode } from "../domain/currencies";
import type {
  RecognitionPlatform,
  RecognitionProfile,
  RecognitionQualificationState,
  TesseractRecognizerConfiguration
} from "../recognition/recognitionProfile";
import { TESSERACT_LSTM_RUNTIME_FILE_NAMES } from "../recognition/tesseractRuntime";

const HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

export function createTestRecognitionProfile({
  id = "test-jpy-ios",
  sourceCurrency = "JPY",
  platform = "ios",
  qualificationState = "qualified",
  expiresAt = "2027-01-01T00:00:00.000Z"
}: {
  id?: string;
  sourceCurrency?: SourceCurrencyCode;
  platform?: RecognitionPlatform;
  qualificationState?: RecognitionQualificationState;
  expiresAt?: string;
} = {}): RecognitionProfile & {
  readonly recognizer: TesseractRecognizerConfiguration;
} {
  return {
    id,
    version: "recognition-profile.v1",
    sourceCurrency,
    platform,
    recognizer: {
      engine: "tesseract.js",
      engineVersion: "7.0.0",
      engineMode: "lstm-only",
      runtime: "tesseract.js-core",
      runtimeVersion: "7.0.0",
      delivery: {
        gzipModels: true,
        workerBlobUrl: false,
        cacheMethod: "none"
      },
      languages: ["jpn", "eng"],
      assets: {
        worker: { path: "/ocr/tesseract-7.0.0/worker.min.js", hash: HASH },
        runtime: {
          basePath: "/ocr/tesseract-core-7.0.0",
          files: TESSERACT_LSTM_RUNTIME_FILE_NAMES.map((fileName) => ({
            path: `/ocr/tesseract-core-7.0.0/${fileName}` as const,
            hash: HASH
          }))
        },
        models: [
          {
            path: "/ocr/tessdata_fast-4.1.0/jpn.traineddata.gz",
            hash: HASH
          },
          {
            path: "/ocr/tessdata_fast-4.1.0/eng.traineddata.gz",
            hash: HASH
          }
        ]
      },
      parameters: {
        guidePageSegmentationMode: "7",
        discoveryPageSegmentationMode: "11",
        preserveInterwordSpaces: "1"
      }
    },
    preprocessing: [
      { id: "raw", operation: "raw" },
      {
        id: "contrast",
        operation: "grayscale-contrast",
        scale: 2,
        contrast: 1.5
      },
      {
        id: "threshold",
        operation: "adaptive-threshold",
        scale: 2,
        windowSize: 3,
        bias: 5
      }
    ],
    notation: {
      fractionDigits: 0,
      markers: ["JPY", "¥", "円"],
      groupingSeparators: [","]
    },
    thresholds: {
      textConfidence: 60,
      markerConfidence: 70,
      candidateConfidence: 70
    },
    fusion: {
      rulesVersion: "jpy-fusion.v1",
      maximumGapInTextHeights: 1.5,
      minimumVerticalOverlapRatio: 0.25,
      maximumBaselineDeltaInTextHeights: 0.75
    },
    geometry: {
      rulesVersion: "bounded-geometry.v1",
      maximumDisplacementInTextHeights: 1.5,
      smoothingFactor: 0.25
    },
    stabilization: {
      rulesVersion: "distinct-frame.v1",
      requiredDistinctFrames: 2,
      coveredMissesBeforeRemoval: 3
    },
    evidence: {
      version: "jpy-ios-evidence.2026-07",
      qualifiedAt: "2026-07-01T00:00:00.000Z",
      expiresAt
    },
    qualificationState
  };
}
