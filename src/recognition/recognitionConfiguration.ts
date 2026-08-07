export type Sha256Hash = `sha256:${string}`;

export interface RecognitionAsset {
  readonly path: `/${string}`;
  /** Hash of the retained artifact bytes before HTTP content decoding. */
  readonly hash: Sha256Hash;
  /** Hash exposed by browser fetch after declared HTTP gzip decoding. */
  readonly decodedHash?: Sha256Hash;
}

export interface TesseractRecognizerConfiguration {
  readonly engine: "tesseract.js";
  readonly engineVersion: "7.0.0";
  readonly engineMode: "lstm-only";
  readonly runtime: "tesseract.js-core";
  readonly runtimeVersion: "7.0.0";
  readonly delivery: {
    readonly gzipModels: true;
    readonly workerBlobUrl: boolean;
    readonly cacheMethod: "none";
  };
  readonly languages: readonly string[];
  readonly assets: {
    readonly worker: RecognitionAsset;
    readonly workerDependencies?: readonly RecognitionAsset[];
    readonly runtime: {
      readonly basePath: `/${string}`;
      readonly files: readonly RecognitionAsset[];
    };
    readonly models: readonly RecognitionAsset[];
  };
  readonly parameters: {
    readonly guidePageSegmentationMode: string;
    readonly discoveryPageSegmentationMode: string;
    readonly preserveInterwordSpaces: string;
  };
}

export interface PaddleOcrRecognizerConfiguration {
  readonly engine: "paddleocr.js";
  readonly engineVersion: "0.4.2";
  readonly runtime: "onnxruntime-web";
  readonly runtimeVersion: "1.24.3";
  readonly delivery: {
    readonly worker: true;
    readonly backend: "wasm";
    readonly wasmPaths: `/${string}`;
  };
  readonly models: {
    readonly detection: string;
    readonly recognition: string;
  };
  readonly assets: {
    readonly worker: RecognitionAsset;
    readonly runtime: {
      readonly basePath: `/${string}`;
      readonly files: readonly RecognitionAsset[];
    };
    readonly models: readonly [RecognitionAsset, RecognitionAsset];
  };
  readonly parameters: {
    readonly textDetLimitSideLen: number;
    readonly textDetLimitType: "min" | "max";
    readonly textDetThresh: number;
    readonly textDetBoxThresh: number;
    readonly textDetUnclipRatio: number;
    readonly textRecScoreThresh: number;
  };
}

export type RecognizerConfiguration =
  | TesseractRecognizerConfiguration
  | PaddleOcrRecognizerConfiguration;

export type RecognitionPreprocessingStep =
  | {
      readonly id: string;
      readonly operation: "raw";
    }
  | {
      readonly id: string;
      readonly operation: "grayscale-contrast";
      readonly scale: number;
      readonly contrast: number;
    }
  | {
      readonly id: string;
      readonly operation: "adaptive-threshold";
      readonly scale: number;
      readonly windowSize: number;
      readonly bias: number;
    };

export type PreprocessingOperation =
  RecognitionPreprocessingStep["operation"];

export function recognizerAssets(
  configuration: RecognizerConfiguration
): readonly RecognitionAsset[] {
  return [
    configuration.assets.worker,
    ...(configuration.engine === "tesseract.js"
      ? (configuration.assets.workerDependencies ?? [])
      : []),
    ...configuration.assets.runtime.files,
    ...configuration.assets.models
  ];
}
