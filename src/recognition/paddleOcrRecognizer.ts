import {
  PaddleOCR,
  type PaddleOCRCreateOptions,
  type OcrResult
} from "@paddleocr/paddleocr-js";

import {
  type JpyComparisonProfile
} from "./comparisonProfiles";
import {
  verifyRecognitionAssets,
  type OcrRecognizer,
  type RecognitionAssetVerifier,
  type RecognitionPassIdentity,
  type RecognizerObservation
} from "./ocrRecognizer";

export interface PaddleOcrRunner {
  initialize(): Promise<unknown>;
  predict(input: unknown): Promise<readonly PaddleRecordedOutput[]>;
  dispose(): Promise<unknown>;
}

export type PaddleRecordedOutput = Pick<
  OcrResult,
  "image" | "metrics" | "runtime"
> & {
  readonly items: readonly {
    readonly poly: readonly (readonly [number, number])[];
    readonly text: string;
    readonly score: number;
  }[];
};

export type PaddleOcrRunnerFactory = (
  options: PaddleOCRCreateOptions
) => Promise<PaddleOcrRunner>;

export function createSameOriginRecognitionFetch({
  origin,
  fetcher = fetch
}: {
  origin: string;
  fetcher?: typeof fetch;
}): typeof fetch {
  const allowedOrigin = new URL(origin).origin;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestedUrl = new URL(
      input instanceof Request ? input.url : input.toString(),
      allowedOrigin
    );
    if (requestedUrl.origin !== allowedOrigin) {
      throw new Error(
        `Recognition blocked a third-party request: ${requestedUrl.origin}`
      );
    }
    return fetcher(requestedUrl, init);
  }) as typeof fetch;
}

function defaultRunnerFactory(
  options: PaddleOCRCreateOptions
): Promise<PaddleOcrRunner> {
  return PaddleOCR.create({ ...options, initialize: false }) as Promise<
    PaddleOcrRunner
  >;
}

function normalizeMarker(value: string): string {
  return value.normalize("NFKC").replaceAll(/\s/gu, "").toUpperCase();
}

export function normalizePaddleRecordedOutput(
  profile: JpyComparisonProfile,
  output: PaddleRecordedOutput,
  passIdentity: RecognitionPassIdentity,
  timing: { startedAtMs: number; completedAtMs: number }
): RecognizerObservation[] {
  const markerSet = new Set(
    profile.recognition.notation.markers.map(normalizeMarker)
  );
  const normalizedTiming = {
    ...timing,
    durationMs: Math.max(0, timing.completedAtMs - timing.startedAtMs)
  };

  return output.items.map(({ text, score, poly }, lineIndex) => {
    if (
      poly.length !== 4 ||
      poly.some(
        (point) =>
          point.length !== 2 || point.some((coordinate) => !Number.isFinite(coordinate))
      )
    ) {
      throw new Error("PaddleOCR.js returned an invalid observation polygon.");
    }
    const [topLeft, topRight, bottomRight, bottomLeft] = poly;
    const xValues = poly.map(([x]) => x);
    const yValues = poly.map(([, y]) => y);
    const minimumX = Math.min(...xValues);
    const maximumX = Math.max(...xValues);
    const minimumY = Math.min(...yValues);
    const maximumY = Math.max(...yValues);

    return {
      text,
      evidenceKind: markerSet.has(normalizeMarker(text))
        ? ("marker" as const)
        : ("text" as const),
      confidence: Math.max(0, Math.min(100, score * 100)),
      line: { blockIndex: 0, paragraphIndex: 0, lineIndex },
      box: {
        x: minimumX,
        y: minimumY,
        width: maximumX - minimumX,
        height: maximumY - minimumY
      },
      polygon: [
        { x: topLeft[0], y: topLeft[1] },
        { x: topRight[0], y: topRight[1] },
        { x: bottomRight[0], y: bottomRight[1] },
        { x: bottomLeft[0], y: bottomLeft[1] }
      ],
      timing: normalizedTiming,
      passIdentity
    };
  });
}

export function createPaddleOcrRecognizer(
  profile: JpyComparisonProfile,
  {
    runnerFactory = defaultRunnerFactory,
    verifyAssets,
    origin = globalThis.location?.origin ?? "http://localhost",
    fetcher = fetch,
    now = () => performance.now()
  }: {
    runnerFactory?: PaddleOcrRunnerFactory;
    verifyAssets?: RecognitionAssetVerifier;
    origin?: string;
    fetcher?: typeof fetch;
    now?: () => number;
  } = {}
): OcrRecognizer {
  const configuration = profile.recognition.recognizer;
  if (configuration.engine !== "paddleocr.js") {
    throw new Error(`${profile.id} is not a PaddleOCR.js comparison profile.`);
  }
  const verifyPinnedAssets =
    verifyAssets ??
    ((assets) =>
      verifyRecognitionAssets(assets, {
        fetcher: createSameOriginRecognitionFetch({ origin, fetcher })
      }));
  let runnerPromise: Promise<PaddleOcrRunner> | null = null;
  const getRunner = () => {
    runnerPromise ??= verifyPinnedAssets(profile.assets)
      .then(() =>
        runnerFactory({
          initialize: false,
          worker: {
            createWorker: () =>
              new Worker(configuration.assets.worker.path, { type: "module" })
          },
          textDetectionModelName: configuration.models.detection,
          textRecognitionModelName: configuration.models.recognition,
          textDetectionModelAsset: {
            url: configuration.assets.models[0].path
          },
          textRecognitionModelAsset: {
            url: configuration.assets.models[1].path
          },
          ortOptions: {
            backend: configuration.delivery.backend,
            wasmPaths: configuration.delivery.wasmPaths,
            numThreads: 1,
            simd: true,
            proxy: false
          },
          ...configuration.parameters
        })
      )
      .then(async (runner) => {
        try {
          await runner.initialize();
          return runner;
        } catch (error) {
          await runner.dispose().catch(() => undefined);
          throw error;
        }
      })
      .catch((error: unknown) => {
        runnerPromise = null;
        throw error;
      });
    return runnerPromise;
  };

  return {
    async prepare() {
      await getRunner();
    },

    async recognize(image, passIdentity) {
      const runner = await getRunner();
      const startedAtMs = now();
      const [output] = await runner.predict(image);
      const completedAtMs = now();
      if (!output) {
        throw new Error("PaddleOCR.js did not return an image result.");
      }
      return normalizePaddleRecordedOutput(profile, output, passIdentity, {
        startedAtMs,
        completedAtMs
      });
    },

    async terminate() {
      if (!runnerPromise) {
        return;
      }
      const runner = await runnerPromise.catch(() => null);
      runnerPromise = null;
      await runner?.dispose();
    }
  };
}
