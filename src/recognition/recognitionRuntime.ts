import { deepFreeze } from "../domain/exactObject";
import {
  recognizerAssets,
  type RecognitionAsset,
  type RecognitionPreprocessingStep,
  type TesseractRecognizerConfiguration
} from "./recognitionConfiguration";
import { TESSERACT_LSTM_RUNTIME_FILE_NAMES } from "./tesseractRuntime";

export interface FixedRecognitionRules {
  readonly version: "fixed-recognition-rules.v1";
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
}

export interface RecognitionRuntimeConfiguration {
  readonly id: string;
  readonly version: "recognition-runtime.v1";
  readonly recognizer: TesseractRecognizerConfiguration;
  readonly preprocessing: readonly RecognitionPreprocessingStep[];
  readonly rules: FixedRecognitionRules;
}

const HASHES = {
  worker:
    "sha256:576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d",
  core: {
    "tesseract-core-lstm.wasm":
      "sha256:66b17df6e20c5329a17ffa9c202a47eaa3e32500b253d4c7f38e7f2bc01457c3",
    "tesseract-core-lstm.wasm.js":
      "sha256:eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680",
    "tesseract-core-relaxedsimd-lstm.wasm":
      "sha256:7985c92d4c64e7267d24cadffe1b2a1da6bf8aa55fdcaf953fe94fe122a24545",
    "tesseract-core-relaxedsimd-lstm.wasm.js":
      "sha256:861a536cf9ef8e63cb644d57bab39c388f37f7d6b6f60024b741c5f6b39a59b3",
    "tesseract-core-simd-lstm.wasm":
      "sha256:34e8d50cac216427d86bf397d610fdd9f49492539bbcdfbfccc4eda20c810bea",
    "tesseract-core-simd-lstm.wasm.js":
      "sha256:c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38"
  },
  models: {
    chi_sim: {
      artifact:
        "sha256:7d4b727797dac9c3668dd09769c07aec3c29fef88b0e980e187f61394cedc823",
      decoded:
        "sha256:a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730"
    },
    chi_tra: {
      artifact:
        "sha256:730d84d5263d9ca6c1db04af24eb37c8e750c94e6419d22e506dd3d7453f9d19",
      decoded:
        "sha256:529c5b5797d64b126065cd55f2bb4c7fd7b15790798091b1ff259941a829330b"
    },
    eng: {
      artifact:
        "sha256:afa9b778b3bfe580362a0b61308d08389c77dd3052c29a35270c827d7e75165c",
      decoded:
        "sha256:7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2"
    },
    jpn: {
      artifact:
        "sha256:daaef8801a960881fb7232653e3edb5964c568f8f3900452b2df142a2b237e45",
      decoded:
        "sha256:1f5de9236d2e85f5fdf4b3c500f2d4926f8d9449f28f5394472d9e8d83b91b4d"
    },
    kor: {
      artifact:
        "sha256:4c3a46d02d0faa699a0010b67e02692800a212d60c5cfca5d51a275bd2e107a9",
      decoded:
        "sha256:6b85e11d9bbf07863b97b3523b1b112844c43e713df8b66418a081fd1060b3b2"
    }
  }
} as const;

const UNIVERSAL_LANGUAGES = [
  "eng",
  "jpn",
  "chi_sim",
  "chi_tra",
  "kor"
] as const;

export const UNIVERSAL_RECOGNITION_RUNTIME: RecognitionRuntimeConfiguration =
  deepFreeze({
    id: "taglingo-universal-tesseract.2026-08-04",
    version: "recognition-runtime.v1",
    recognizer: {
      engine: "tesseract.js",
      engineVersion: "7.0.0",
      engineMode: "lstm-only",
      runtime: "tesseract.js-core",
      runtimeVersion: "7.0.0",
      delivery: {
        gzipModels: true,
        workerBlobUrl: true,
        cacheMethod: "none"
      },
      languages: UNIVERSAL_LANGUAGES,
      assets: {
        worker: {
          path: "/ocr/tesseract-7.0.0/worker.min.js",
          hash: HASHES.worker
        },
        runtime: {
          basePath: "/ocr/tesseract-core-7.0.0",
          files: TESSERACT_LSTM_RUNTIME_FILE_NAMES.map((fileName) => ({
            path: `/ocr/tesseract-core-7.0.0/${fileName}` as const,
            hash: HASHES.core[fileName]
          }))
        },
        models: UNIVERSAL_LANGUAGES.map((language) => ({
          path: `/ocr/tessdata_fast-4.1.0/${language}.traineddata.gz` as const,
          hash: HASHES.models[language].artifact,
          decodedHash: HASHES.models[language].decoded
        }))
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
    rules: {
      version: "fixed-recognition-rules.v1",
      thresholds: {
        textConfidence: 60,
        markerConfidence: 70,
        candidateConfidence: 70
      },
      fusion: {
        rulesVersion: "universal-fusion.v1",
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
      }
    }
  });

export function recognitionRuntimeAssets(
  runtime: RecognitionRuntimeConfiguration
): readonly RecognitionAsset[] {
  return recognizerAssets(runtime.recognizer);
}

export function assertValidRecognitionRuntime(
  runtime: RecognitionRuntimeConfiguration
): void {
  const assets = recognitionRuntimeAssets(runtime);
  const selfHosted = (path: string) => /^\/(?!\/)[^\\?#]+$/u.test(path);
  const languageModelsMatch =
    runtime.recognizer.languages.length ===
      runtime.recognizer.assets.models.length &&
    runtime.recognizer.languages.every((language, index) =>
      runtime.recognizer.assets.models[index].path.endsWith(
        `/${language}.traineddata.gz`
      )
    );
  const preprocessingIds = new Set(
    runtime.preprocessing.map(({ id }) => id)
  );

  if (
    runtime.version !== "recognition-runtime.v1" ||
    !runtime.id ||
    runtime.recognizer.languages.length === 0 ||
    !selfHosted(runtime.recognizer.assets.runtime.basePath) ||
    assets.some(
      ({ path, hash, decodedHash }) =>
        !selfHosted(path) ||
        !/^sha256:[a-f\d]{64}$/u.test(hash) ||
        (decodedHash !== undefined &&
          !/^sha256:[a-f\d]{64}$/u.test(decodedHash))
    ) ||
    !languageModelsMatch ||
    preprocessingIds.size !== runtime.preprocessing.length ||
    runtime.preprocessing.length === 0 ||
    runtime.rules.stabilization.requiredDistinctFrames < 1 ||
    runtime.rules.stabilization.coveredMissesBeforeRemoval < 1 ||
    runtime.rules.geometry.smoothingFactor <= 0 ||
    runtime.rules.geometry.smoothingFactor > 1 ||
    runtime.rules.fusion.minimumVerticalOverlapRatio < 0 ||
    runtime.rules.fusion.minimumVerticalOverlapRatio > 1
  ) {
    throw new Error(`Recognition runtime ${runtime.id || "<unknown>"} is invalid.`);
  }
}

assertValidRecognitionRuntime(UNIVERSAL_RECOGNITION_RUNTIME);
