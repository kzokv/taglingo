import Tesseract from "tesseract.js";

import type { OcrToken } from "./priceLocalization";
import {
  recognitionAssets,
  type RecognitionAsset,
  type RecognitionProfile
} from "./recognitionProfile";

interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface OcrBlocksResult {
  data: {
    blocks:
      | Array<{
          paragraphs: Array<{
            lines: Array<{ words: OcrWord[] }>;
          }>;
        }>
      | null;
  };
}

export interface OcrWorker {
  recognize(
    image: Tesseract.ImageLike,
    options?: unknown,
    output?: { text?: boolean; blocks?: boolean }
  ): Promise<OcrBlocksResult>;
  setParameters(parameters: Record<string, string>): Promise<unknown>;
  terminate(): Promise<unknown>;
}

export type WorkerFactory = (
  languages: string[],
  engineMode: Tesseract.OEM,
  options: {
    workerPath: string;
    corePath: string;
    langPath: string;
    gzip: boolean;
    workerBlobURL: boolean;
    cacheMethod: "none";
    logger: (message: Tesseract.LoggerMessage) => void;
  }
) => Promise<OcrWorker>;

export type RecognitionAssetVerifier = (
  assets: readonly RecognitionAsset[]
) => Promise<void>;

export interface RecognitionPassIdentity {
  kind: "guide" | "discovery";
  frameIdentity: string;
  preprocessingIdentity: string;
}

export interface RecognizerObservation extends OcrToken {
  evidenceKind: "text" | "marker";
  polygon: readonly [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number }
  ];
  timing: {
    startedAtMs: number;
    completedAtMs: number;
    durationMs: number;
  };
  passIdentity: RecognitionPassIdentity;
}

export interface OcrRecognizer {
  prepare(): Promise<void>;
  recognize(
    image: Tesseract.ImageLike,
    passIdentity: RecognitionPassIdentity
  ): Promise<RecognizerObservation[]>;
  terminate(): Promise<void>;
}

function defaultWorkerFactory(
  languages: string[],
  engineMode: Tesseract.OEM,
  options: Parameters<WorkerFactory>[2]
): Promise<OcrWorker> {
  return Tesseract.createWorker(
    languages,
    engineMode,
    options
  ) as unknown as Promise<OcrWorker>;
}

function parentPath(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

function normalizeMarker(value: string): string {
  return value.normalize("NFKC").replaceAll(/\s/gu, "").toUpperCase();
}

function digestToHex(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function verifyRecognitionAssets(
  assets: readonly RecognitionAsset[],
  {
    fetcher = fetch
  }: {
    fetcher?: typeof fetch;
  } = {}
): Promise<void> {
  for (const { path, hash } of assets) {
    const response = await fetcher(path, { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error(`Recognition asset could not be loaded: ${path}`);
    }
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      await response.arrayBuffer()
    );
    if (`sha256:${digestToHex(digest)}` !== hash) {
      throw new Error(`Recognition asset hash mismatch: ${path}`);
    }
  }
}

export function createOcrRecognizer(
  profile: RecognitionProfile,
  {
    onProgress = () => undefined,
    workerFactory = defaultWorkerFactory,
    verifyAssets = verifyRecognitionAssets,
    now = () => performance.now()
  }: {
    onProgress?: (progress: number, status: string) => void;
    workerFactory?: WorkerFactory;
    verifyAssets?: RecognitionAssetVerifier;
    now?: () => number;
  } = {}
): OcrRecognizer {
  let workerPromise: Promise<OcrWorker> | null = null;
  const markerSet = new Set(profile.notation.markers.map(normalizeMarker));
  const pinnedAssets = recognitionAssets(profile);

  const getWorker = () => {
    workerPromise ??= verifyAssets(pinnedAssets)
      .then(() =>
        workerFactory(
          [...profile.recognizer.languages],
          profile.recognizer.engineMode === "lstm-only"
            ? Tesseract.OEM.LSTM_ONLY
            : Tesseract.OEM.DEFAULT,
          {
            workerPath: profile.recognizer.assets.worker.path,
            corePath: profile.recognizer.assets.runtime.basePath,
            langPath: parentPath(profile.recognizer.assets.models[0].path),
            gzip: profile.recognizer.delivery.gzipModels,
            workerBlobURL: profile.recognizer.delivery.workerBlobUrl,
            cacheMethod: profile.recognizer.delivery.cacheMethod,
            logger: ({ progress, status }) => onProgress(progress, status)
          }
        )
      )
      .then(async (worker) => {
        try {
          await worker.setParameters({
            tessedit_pageseg_mode:
              profile.recognizer.parameters.guidePageSegmentationMode,
            preserve_interword_spaces:
              profile.recognizer.parameters.preserveInterwordSpaces
          });
          return worker;
        } catch (error) {
          await worker.terminate().catch(() => undefined);
          throw error;
        }
      })
      .catch((error: unknown) => {
        workerPromise = null;
        throw error;
      });
    return workerPromise;
  };

  return {
    async prepare() {
      await getWorker();
    },

    async recognize(image, passIdentity) {
      const worker = await getWorker();
      await worker.setParameters({
        tessedit_pageseg_mode:
          passIdentity.kind === "discovery"
            ? profile.recognizer.parameters.discoveryPageSegmentationMode
            : profile.recognizer.parameters.guidePageSegmentationMode
      });
      const startedAtMs = now();
      const {
        data: { blocks }
      } = (await worker.recognize(
        image,
        {},
        { text: false, blocks: true }
      )) as OcrBlocksResult;
      const completedAtMs = now();
      const timing = {
        startedAtMs,
        completedAtMs,
        durationMs: Math.max(0, completedAtMs - startedAtMs)
      };

      return (blocks ?? []).flatMap(({ paragraphs }, blockIndex) =>
        paragraphs.flatMap(({ lines }, paragraphIndex) =>
          lines.flatMap(({ words }, lineIndex) =>
            words.map(({ text, confidence, bbox }) => ({
              text,
              evidenceKind: markerSet.has(normalizeMarker(text))
                ? ("marker" as const)
                : ("text" as const),
              confidence,
              line: { blockIndex, paragraphIndex, lineIndex },
              box: {
                x: bbox.x0,
                y: bbox.y0,
                width: bbox.x1 - bbox.x0,
                height: bbox.y1 - bbox.y0
              },
              polygon: [
                { x: bbox.x0, y: bbox.y0 },
                { x: bbox.x1, y: bbox.y0 },
                { x: bbox.x1, y: bbox.y1 },
                { x: bbox.x0, y: bbox.y1 }
              ],
              timing,
              passIdentity
            }))
          )
        )
      );
    },

    async terminate() {
      if (!workerPromise) {
        return;
      }
      const worker = await workerPromise.catch(() => null);
      workerPromise = null;
      await worker?.terminate();
    }
  };
}
