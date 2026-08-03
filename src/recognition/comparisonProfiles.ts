import provenanceJson from "../../public/ocr/comparison/jpy-provenance.v1.json";

import type {
  PaddleOcrRecognizerConfiguration,
  RecognitionAsset,
  RecognitionPreprocessingStep,
  RecognitionProfile,
  TesseractRecognizerConfiguration
} from "./recognitionProfile";

export type ComparisonAssetRole =
  | "runtime"
  | "worker"
  | "model"
  | "dictionary"
  | "preprocessing"
  | "configuration";

export interface FrozenComparisonAsset extends RecognitionAsset {
  readonly roles: readonly ComparisonAssetRole[];
  readonly transferBytes: number;
  readonly storageBytes: number;
}

export interface JpyComparisonProfile {
  readonly id: string;
  readonly version: "comparison-profile.v1";
  readonly recognition: RecognitionProfile;
  readonly assets: readonly FrozenComparisonAsset[];
  readonly budget: {
    readonly transferBytes: number;
    readonly storageBytes: number;
  };
  readonly execution: {
    readonly platform: "ios";
    readonly sdk: "official-paddleocr.js" | "tesseract.js";
    readonly backend: "wasm";
    readonly worker: true;
    readonly directOrtEscapeHatch: {
      readonly active: false;
      readonly blocker: null;
      readonly approval: "issue-45-only-after-documented-official-sdk-blocker";
    };
  };
  readonly reproduction: {
    readonly frozenAt: string;
    readonly profileVersion: "comparison-profile.v1";
    readonly sourceCurrency: "JPY";
    readonly physicalPlatform: "ios";
    readonly sdkPackage: string;
    readonly sdkVersion: string;
    readonly sdkIntegrity: `sha512-${string}`;
    readonly runtimePackage: string;
    readonly runtimeVersion: string;
    readonly runtimeIntegrity: `sha512-${string}`;
    readonly modelIdentity: string;
    readonly evidenceContractVersion: string;
  };
}

interface ProvenanceAsset {
  path: `/${string}`;
  sha256: string;
  bytes: number;
  roles: ComparisonAssetRole[];
  packagePath?: string;
  sourceUrl?: string;
}

interface ProvenancePackage {
  name: string;
  version: string;
  integrity: `sha512-${string}`;
}

interface PaddleConfiguration {
  engine: "paddleocr.js";
  detector: string;
  recognizer: string;
  modelIdentity: string;
}

interface TesseractConfiguration {
  engine: "tesseract.js";
  languages: string[];
  modelIdentity: string;
}

interface ProvenanceManifest {
  version: "jpy-comparison-provenance.v1";
  frozenAt: string;
  limits: { transferBytes: number; storageBytes: number };
  packages: {
    paddleSdk: ProvenancePackage;
    paddleRuntime: ProvenancePackage;
    tesseractSdk: ProvenancePackage;
    tesseractRuntime: ProvenancePackage;
  };
  assets: Record<string, ProvenanceAsset>;
  preprocessing: RecognitionPreprocessingStep[];
  paddleParameters: PaddleOcrRecognizerConfiguration["parameters"];
  tesseractParameters: TesseractRecognizerConfiguration["parameters"];
  profileConfigurations: Record<
    string,
    PaddleConfiguration | TesseractConfiguration
  >;
  profileAssets: Record<string, string[]>;
}

export const JPY_COMPARISON_PROVENANCE =
  provenanceJson as unknown as ProvenanceManifest;

export const COMPARISON_PROFILE_LIMITS = Object.freeze({
  maximumTransferBytes: JPY_COMPARISON_PROVENANCE.limits.transferBytes,
  maximumStorageBytes: JPY_COMPARISON_PROVENANCE.limits.storageBytes
});

const PROVENANCE_ASSET: FrozenComparisonAsset = {
  path: "/ocr/comparison/jpy-provenance.v1.json",
  hash: "sha256:bc6004d67cfeb26a9550dfaef7e93ba5a0ab0da167a888e937a34f58108f3b73",
  transferBytes: 8_034,
  storageBytes: 8_034,
  roles: ["preprocessing", "configuration"]
};

function frozenAsset(assetId: string): FrozenComparisonAsset {
  const declared = JPY_COMPARISON_PROVENANCE.assets[assetId];
  if (!declared) {
    throw new Error(`Unknown comparison asset: ${assetId}`);
  }
  return {
    path: declared.path,
    hash: `sha256:${declared.sha256}`,
    transferBytes: declared.bytes,
    storageBytes: declared.bytes,
    roles: declared.roles
  };
}

function profileAssets(profileId: string): readonly FrozenComparisonAsset[] {
  const assetIds = JPY_COMPARISON_PROVENANCE.profileAssets[profileId];
  if (!assetIds) {
    throw new Error(`Comparison profile ${profileId} has no asset manifest.`);
  }
  return [...assetIds.map(frozenAsset), PROVENANCE_ASSET];
}

function budget(assets: readonly FrozenComparisonAsset[]) {
  return {
    transferBytes: assets.reduce(
      (total, current) => total + current.transferBytes,
      0
    ),
    storageBytes: assets.reduce(
      (total, current) => total + current.storageBytes,
      0
    )
  };
}

const SHARED_RULES = {
  preprocessing: JPY_COMPARISON_PROVENANCE.preprocessing,
  notation: {
    fractionDigits: 0,
    markers: ["JPY", "¥", "￥", "円"],
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
  qualificationState: "pending" as const
};

function execution(
  sdk: JpyComparisonProfile["execution"]["sdk"]
): JpyComparisonProfile["execution"] {
  return {
    platform: "ios",
    sdk,
    backend: "wasm",
    worker: true,
    directOrtEscapeHatch: {
      active: false,
      blocker: null,
      approval: "issue-45-only-after-documented-official-sdk-blocker"
    }
  };
}

function reproduction(
  profileId: string,
  modelIdentity: string,
  sdk: ProvenancePackage,
  runtime: ProvenancePackage
): JpyComparisonProfile["reproduction"] {
  return {
    frozenAt: JPY_COMPARISON_PROVENANCE.frozenAt,
    profileVersion: "comparison-profile.v1",
    sourceCurrency: "JPY",
    physicalPlatform: "ios",
    sdkPackage: sdk.name,
    sdkVersion: sdk.version,
    sdkIntegrity: sdk.integrity,
    runtimePackage: runtime.name,
    runtimeVersion: runtime.version,
    runtimeIntegrity: runtime.integrity,
    modelIdentity,
    evidenceContractVersion: `${profileId}:qualification-contract.v1`
  };
}

function paddleProfile(profileId: string): JpyComparisonProfile {
  const configuration = JPY_COMPARISON_PROVENANCE.profileConfigurations[
    profileId
  ] as PaddleConfiguration;
  const assets = profileAssets(profileId);
  const assetByPath = new Map(assets.map((asset) => [asset.path, asset]));
  const declaredAssets = JPY_COMPARISON_PROVENANCE.assets;
  const worker = assetByPath.get(declaredAssets.paddleGuardedWorker.path)!;
  const runtimeFiles = [
    assetByPath.get(declaredAssets.ortModule.path)!,
    assetByPath.get(declaredAssets.ortWasm.path)!
  ];
  const models = [configuration.detector, configuration.recognizer].map(
    (modelName) => assets.find(({ path }) => path.includes(modelName))!
  ) as [FrozenComparisonAsset, FrozenComparisonAsset];
  const recognizer: PaddleOcrRecognizerConfiguration = {
    engine: "paddleocr.js",
    engineVersion: "0.4.2",
    runtime: "onnxruntime-web",
    runtimeVersion: "1.24.3",
    delivery: {
      worker: true,
      backend: "wasm",
      wasmPaths: "/ocr/onnxruntime-web-1.24.3/"
    },
    models: {
      detection: configuration.detector,
      recognition: configuration.recognizer
    },
    assets: {
      worker,
      runtime: {
        basePath: "/ocr/onnxruntime-web-1.24.3",
        files: runtimeFiles
      },
      models
    },
    parameters: JPY_COMPARISON_PROVENANCE.paddleParameters
  };
  return {
    id: profileId,
    version: "comparison-profile.v1",
    recognition: {
      id: profileId,
      version: "recognition-profile.v1",
      sourceCurrency: "JPY",
      platform: "ios",
      recognizer,
      ...SHARED_RULES,
      evidence: {
        version: `${profileId}:qualification-contract.v1`,
        qualifiedAt: JPY_COMPARISON_PROVENANCE.frozenAt,
        expiresAt: "2027-08-03T00:00:00.000Z"
      }
    },
    assets,
    budget: budget(assets),
    execution: execution("official-paddleocr.js"),
    reproduction: reproduction(
      profileId,
      configuration.modelIdentity,
      JPY_COMPARISON_PROVENANCE.packages.paddleSdk,
      JPY_COMPARISON_PROVENANCE.packages.paddleRuntime
    )
  };
}

function tesseractProfile(profileId: string): JpyComparisonProfile {
  const configuration = JPY_COMPARISON_PROVENANCE.profileConfigurations[
    profileId
  ] as TesseractConfiguration;
  const assets = profileAssets(profileId);
  const assetByPath = new Map(assets.map((asset) => [asset.path, asset]));
  const declaredAssets = JPY_COMPARISON_PROVENANCE.assets;
  const recognizer: TesseractRecognizerConfiguration = {
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
    languages: configuration.languages,
    assets: {
      worker: assetByPath.get(declaredAssets.tesseractWorker.path)!,
      runtime: {
        basePath: "/ocr/tesseract-core-7.0.0",
        files: assets.filter(({ path }) =>
          path.startsWith("/ocr/tesseract-core-7.0.0/")
        )
      },
      models: configuration.languages.map((language) =>
        assets.find(({ path }) =>
          path.endsWith(`/${language}.traineddata.gz`)
        )!
      )
    },
    parameters: JPY_COMPARISON_PROVENANCE.tesseractParameters
  };
  return {
    id: profileId,
    version: "comparison-profile.v1",
    recognition: {
      id: profileId,
      version: "recognition-profile.v1",
      sourceCurrency: "JPY",
      platform: "ios",
      recognizer,
      ...SHARED_RULES,
      evidence: {
        version: `${profileId}:qualification-contract.v1`,
        qualifiedAt: JPY_COMPARISON_PROVENANCE.frozenAt,
        expiresAt: "2027-08-03T00:00:00.000Z"
      }
    },
    assets,
    budget: budget(assets),
    execution: execution("tesseract.js"),
    reproduction: reproduction(
      profileId,
      configuration.modelIdentity,
      JPY_COMPARISON_PROVENANCE.packages.tesseractSdk,
      JPY_COMPARISON_PROVENANCE.packages.tesseractRuntime
    )
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

export function isComparisonProfileEligible(
  profile: JpyComparisonProfile
): boolean {
  return (
    profile.budget.transferBytes <=
      COMPARISON_PROFILE_LIMITS.maximumTransferBytes &&
    profile.budget.storageBytes <=
      COMPARISON_PROFILE_LIMITS.maximumStorageBytes
  );
}

export function verifyComparisonProfileMetadata(
  profile: JpyComparisonProfile
): void {
  const requiredRoles: readonly ComparisonAssetRole[] = [
    "runtime",
    "worker",
    "model",
    "dictionary",
    "preprocessing",
    "configuration"
  ];
  const roles = new Set(
    profile.assets.flatMap(({ roles: assetRoles }) => assetRoles)
  );
  const invalidAsset = profile.assets.some(
    ({ path, hash, transferBytes, storageBytes, roles: assetRoles }) =>
      !/^\/(?!\/)[^\\?#]+$/u.test(path) ||
      !/^sha256:[a-f\d]{64}$/u.test(hash) ||
      !Number.isSafeInteger(transferBytes) ||
      transferBytes <= 0 ||
      !Number.isSafeInteger(storageBytes) ||
      storageBytes <= 0 ||
      assetRoles.length === 0
  );
  const measuredBudget = budget(profile.assets);
  if (
    profile.version !== "comparison-profile.v1" ||
    profile.recognition.sourceCurrency !== "JPY" ||
    profile.recognition.platform !== profile.execution.platform ||
    profile.execution.backend !== "wasm" ||
    profile.execution.directOrtEscapeHatch.active ||
    invalidAsset ||
    requiredRoles.some((role) => !roles.has(role)) ||
    measuredBudget.transferBytes !== profile.budget.transferBytes ||
    measuredBudget.storageBytes !== profile.budget.storageBytes
  ) {
    throw new Error(`Comparison profile ${profile.id} is incomplete.`);
  }
  if (!isComparisonProfileEligible(profile)) {
    throw new Error(`Comparison profile ${profile.id} exceeds its budget.`);
  }
}

export const JPY_COMPARISON_PROFILES: readonly JpyComparisonProfile[] =
  deepFreeze([
    paddleProfile("jpy-pp-ocrv6-small.2026-08-03"),
    paddleProfile("jpy-pp-ocrv5-mobile.2026-08-03"),
    tesseractProfile("jpy-tesseract-7.2026-08-03")
  ]);

for (const profile of JPY_COMPARISON_PROFILES) {
  verifyComparisonProfileMetadata(profile);
}
