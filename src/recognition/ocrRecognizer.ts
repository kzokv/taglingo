import Tesseract from "tesseract.js";

import type {
  SourceCurrencyCode
} from "../domain/currencies";
import type { OcrToken } from "./priceLocalization";

export const OCR_ASSET_PATHS = {
  worker: "/ocr/tesseract-7.0.0/worker.min.js",
  core: "/ocr/tesseract-core-7.0.0",
  languages: "/ocr/tessdata_fast-4.1.0"
} as const;

export const OCR_LANGUAGE_PROFILES: Record<
  SourceCurrencyCode,
  readonly string[]
> = {
  USD: ["eng"],
  EUR: ["eng"],
  JPY: ["jpn", "eng"],
  GBP: ["eng"],
  CNY: ["chi_sim", "eng"],
  KRW: ["kor", "eng"],
  TWD: ["chi_tra", "eng"],
  HKD: ["chi_tra", "eng"],
  AUD: ["eng"],
  CAD: ["eng"],
  SGD: ["eng"],
  CHF: ["eng"]
};

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
    logger: (message: Tesseract.LoggerMessage) => void;
  }
) => Promise<OcrWorker>;

export interface OcrRecognizer {
  prepare(): Promise<void>;
  recognize(
    image: Tesseract.ImageLike,
    pass?: "focused" | "discovery"
  ): Promise<OcrToken[]>;
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

export function createOcrRecognizer(
  sourceCurrency: SourceCurrencyCode,
  {
    onProgress = () => undefined,
    workerFactory = defaultWorkerFactory
  }: {
    onProgress?: (progress: number, status: string) => void;
    workerFactory?: WorkerFactory;
  } = {}
): OcrRecognizer {
  let workerPromise: Promise<OcrWorker> | null = null;

  const getWorker = () => {
    workerPromise ??= workerFactory(
      [...OCR_LANGUAGE_PROFILES[sourceCurrency]],
      Tesseract.OEM.LSTM_ONLY,
      {
        workerPath: OCR_ASSET_PATHS.worker,
        corePath: OCR_ASSET_PATHS.core,
        langPath: OCR_ASSET_PATHS.languages,
        gzip: true,
        workerBlobURL: false,
        logger: ({ progress, status }) => onProgress(progress, status)
      }
    )
      .then(async (worker) => {
        await worker.setParameters({
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
          preserve_interword_spaces: "1"
        });
        return worker;
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

    async recognize(image, pass = "focused") {
      const worker = await getWorker();
      await worker.setParameters({
        tessedit_pageseg_mode:
          pass === "discovery"
            ? Tesseract.PSM.SPARSE_TEXT
            : Tesseract.PSM.SINGLE_LINE
      });
      const {
        data: { blocks }
      } = (await worker.recognize(
        image,
        {},
        { text: false, blocks: true }
      )) as OcrBlocksResult;

      return (blocks ?? []).flatMap(({ paragraphs }, blockIndex) =>
        paragraphs.flatMap(({ lines }, paragraphIndex) =>
          lines.flatMap(({ words }, lineIndex) =>
            words.map(({ text, confidence, bbox }) => ({
              text,
              confidence,
              line: { blockIndex, paragraphIndex, lineIndex },
              box: {
                x: bbox.x0,
                y: bbox.y0,
                width: bbox.x1 - bbox.x0,
                height: bbox.y1 - bbox.y0
              }
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
