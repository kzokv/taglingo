import type { SourceCurrencyCode } from "../domain/currencies";
import type { PhysicalPlatform } from "../domain/currencyCapabilities";
import { deepFreeze } from "../domain/exactObject";
import { TESSERACT_LSTM_RUNTIME_FILE_NAMES } from "./tesseractRuntime";

export type RecognitionQualificationState =
  | "pending"
  | "qualified"
  | "failed"
  | "demoted";

export type RecognitionPlatform = Exclude<PhysicalPlatform, "other">;

export type Sha256Hash = `sha256:${string}`;

export interface RecognitionAsset {
  readonly path: `/${string}`;
  readonly hash: Sha256Hash;
}

export interface TesseractRecognizerConfiguration {
  readonly engine: "tesseract.js";
  readonly engineVersion: "7.0.0";
  readonly engineMode: "lstm-only";
  readonly runtime: "tesseract.js-core";
  readonly runtimeVersion: "7.0.0";
  readonly delivery: {
    readonly gzipModels: true;
    readonly workerBlobUrl: false;
    readonly cacheMethod: "none";
  };
  readonly languages: readonly string[];
  readonly assets: {
    readonly worker: RecognitionAsset;
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

// The profile freezes every recognition-affecting input here. The scheduler,
// evidence-fusion, and tracking work in issues #50–#52 consume the relevant
// portfolios and rule values without changing this qualification contract.
export interface RecognitionProfile {
  readonly id: string;
  readonly version: "recognition-profile.v1";
  readonly sourceCurrency: SourceCurrencyCode;
  readonly platform: RecognitionPlatform;
  readonly recognizer: RecognizerConfiguration;
  readonly preprocessing: readonly RecognitionPreprocessingStep[];
  readonly notation: {
    readonly fractionDigits: number;
    readonly decimalSeparator?: "." | ",";
    readonly markers: readonly string[];
    readonly groupingSeparators: readonly string[];
  };
  readonly thresholds: {
    readonly textConfidence: number;
    readonly markerConfidence: number;
    readonly candidateConfidence: number;
  };
  readonly fusion: {
    readonly rulesVersion: string;
    readonly maximumGapInTextHeights: number;
    readonly minimumVerticalOverlapRatio: number;
    readonly maximumBaselineDeltaInTextHeights: number;
  };
  readonly geometry: {
    readonly rulesVersion: string;
    readonly maximumDisplacementInTextHeights: number;
    readonly smoothingFactor: number;
  };
  readonly stabilization: {
    readonly rulesVersion: string;
    readonly requiredDistinctFrames: number;
    readonly coveredMissesBeforeRemoval: number;
  };
  readonly evidence: {
    readonly version: string;
    readonly qualifiedAt: string;
    readonly expiresAt: string;
  };
  readonly qualificationState: RecognitionQualificationState;
}

export interface RecognitionProfileRegistry {
  resolve(
    sourceCurrency: SourceCurrencyCode,
    platform: PhysicalPlatform
  ): RecognitionProfile | null;
}

export type ResolveRecognitionProfile = RecognitionProfileRegistry["resolve"];

export function recognitionAssets(
  profile: RecognitionProfile
): readonly RecognitionAsset[] {
  return [
    profile.recognizer.assets.worker,
    ...profile.recognizer.assets.runtime.files,
    ...profile.recognizer.assets.models
  ];
}

function assertValidRecognitionProfile(profile: RecognitionProfile) {
  const assets = recognitionAssets(profile);
  const isSelfHostedPath = (path: string) =>
    /^\/(?!\/)[^\\?#]+$/u.test(path);
  if (
    !isSelfHostedPath(profile.recognizer.assets.runtime.basePath) ||
    assets.some(({ path }) => !isSelfHostedPath(path))
  ) {
    throw new Error(
      `Recognition profile ${profile.id || "<unknown>"} must use self-hosted assets.`
    );
  }
  if (
    profile.fusion.maximumGapInTextHeights < 0 ||
    profile.fusion.minimumVerticalOverlapRatio < 0 ||
    profile.fusion.minimumVerticalOverlapRatio > 1 ||
    profile.fusion.maximumBaselineDeltaInTextHeights < 0
  ) {
    throw new Error(
      `Recognition profile ${profile.id} has invalid fusion geometry rules.`
    );
  }
  if (
    !profile.id ||
    (profile.recognizer.engine === "tesseract.js" &&
      profile.recognizer.languages.length === 0) ||
    profile.recognizer.assets.runtime.files.length === 0 ||
    profile.recognizer.assets.models.length === 0 ||
    profile.preprocessing.length === 0 ||
    profile.notation.markers.length === 0 ||
    assets.some(({ hash }) => !/^sha256:[a-f\d]{64}$/u.test(hash))
  ) {
    throw new Error(
      `Recognition profile ${profile.id || "<unknown>"} is incomplete.`
    );
  }

  const preprocessingIds = new Set(
    profile.preprocessing.map(({ id }) => id)
  );
  if (
    preprocessingIds.size !== profile.preprocessing.length ||
    profile.preprocessing.some((step) => {
      if (!step.id) {
        return true;
      }
      if (step.operation === "raw") {
        return false;
      }
      if (!Number.isFinite(step.scale) || step.scale < 1) {
        return true;
      }
      if (step.operation === "grayscale-contrast") {
        return !Number.isFinite(step.contrast) || step.contrast <= 0;
      }
      return (
        !Number.isInteger(step.windowSize) ||
        step.windowSize < 3 ||
        step.windowSize % 2 === 0 ||
        !Number.isFinite(step.bias)
      );
    })
  ) {
    throw new Error(
      `Recognition profile ${profile.id} has invalid preprocessing rules.`
    );
  }

  const modelPathsMatchConfiguration =
    profile.recognizer.engine === "tesseract.js"
      ? profile.recognizer.languages.length ===
          profile.recognizer.assets.models.length &&
        profile.recognizer.languages.every((language, index) =>
          profile.recognizer.assets.models[index].path.endsWith(
            `/${language}.traineddata.gz`
          )
        )
      : profile.recognizer.assets.models[0].path.includes(
            profile.recognizer.models.detection
          ) &&
        profile.recognizer.assets.models[1].path.includes(
          profile.recognizer.models.recognition
        );
  const modelDirectories = new Set(
    profile.recognizer.assets.models.map(({ path }) =>
      path.slice(0, path.lastIndexOf("/"))
    )
  );
  const runtimeFilesMatchBasePath =
    profile.recognizer.assets.runtime.files.every(({ path }) =>
      path.startsWith(`${profile.recognizer.assets.runtime.basePath}/`)
    );
  const runtimeFileNames = profile.recognizer.assets.runtime.files
    .map(({ path }) => path.slice(path.lastIndexOf("/") + 1))
    .sort();
  const runtimeFilesMatchConfiguration =
    profile.recognizer.engine === "tesseract.js"
      ? runtimeFileNames.join("\n") ===
        TESSERACT_LSTM_RUNTIME_FILE_NAMES.join("\n")
      : runtimeFileNames.includes("ort-wasm-simd-threaded.wasm") &&
        runtimeFileNames.includes("ort-wasm-simd-threaded.mjs");
  if (
    !modelPathsMatchConfiguration ||
    modelDirectories.size !== 1 ||
    !runtimeFilesMatchBasePath ||
    !runtimeFilesMatchConfiguration
  ) {
    throw new Error(
      `Recognition profile ${profile.id} model assets do not match its loaded configuration.`
    );
  }

  const qualifiedAt = Date.parse(profile.evidence.qualifiedAt);
  const expiresAt = Date.parse(profile.evidence.expiresAt);
  if (
    !Number.isFinite(qualifiedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= qualifiedAt
  ) {
    throw new Error(
      `Recognition profile ${profile.id} has invalid evidence dates.`
    );
  }
}

export function createRecognitionProfileRegistry(
  profiles: readonly RecognitionProfile[],
  { now = () => new Date() }: { now?: () => Date } = {}
): RecognitionProfileRegistry {
  const byCurrencyAndPlatform = new Map<string, RecognitionProfile>();

  for (const profile of profiles) {
    assertValidRecognitionProfile(profile);
    const key = `${profile.sourceCurrency}:${profile.platform}`;
    if (byCurrencyAndPlatform.has(key)) {
      throw new Error(
        `Exactly one recognition profile may be registered for ${key}.`
      );
    }
    byCurrencyAndPlatform.set(key, deepFreeze(profile));
  }

  return {
    resolve(sourceCurrency, platform) {
      if (platform === "other") {
        return null;
      }
      const profile = byCurrencyAndPlatform.get(
        `${sourceCurrency}:${platform}`
      );
      if (
        !profile ||
        profile.qualificationState !== "qualified" ||
        Date.parse(profile.evidence.expiresAt) <= now().getTime()
      ) {
        return null;
      }
      return profile;
    }
  };
}

// Qualification evidence is intentionally empty until a physical-device
// report passes the product gate. Desktop tests inject frozen profiles without
// making a production Camera-supported claim.
export const PRODUCTION_RECOGNITION_PROFILES: readonly RecognitionProfile[] =
  deepFreeze([]);

const productionRegistry = createRecognitionProfileRegistry(
  PRODUCTION_RECOGNITION_PROFILES
);

export const resolveQualifiedRecognitionProfile: ResolveRecognitionProfile =
  (sourceCurrency, platform) =>
    productionRegistry.resolve(sourceCurrency, platform);
