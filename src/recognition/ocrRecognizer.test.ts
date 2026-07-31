import { describe, expect, it, vi } from "vitest";

import type { SourceCurrencyCode } from "../domain/currencies";
import {
  createOcrRecognizer,
  OCR_LANGUAGE_PROFILES,
  type OcrWorker
} from "./ocrRecognizer";

function worker() {
  return {
    recognize: vi.fn().mockResolvedValue({
      data: {
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    words: [
                      {
                        text: "가격 １，２３４원",
                        confidence: 92,
                        bbox: { x0: 14, y0: 20, x1: 132, y1: 52 }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    }),
    setParameters: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn().mockResolvedValue(undefined)
  } satisfies OcrWorker;
}

describe("Source Currency OCR profiles", () => {
  it.each([
    ["USD", ["eng"]],
    ["EUR", ["eng"]],
    ["JPY", ["jpn", "eng"]],
    ["CNY", ["chi_sim", "eng"]],
    ["TWD", ["chi_tra", "eng"]],
    ["HKD", ["chi_tra", "eng"]],
    ["KRW", ["kor", "eng"]]
  ] satisfies ReadonlyArray<
    readonly [SourceCurrencyCode, readonly string[]]
  >)("lazily loads only the selected %s language family", async (
    currency,
    languages
  ) => {
    const ocrWorker = worker();
    const workerFactory = vi.fn().mockResolvedValue(ocrWorker);
    const recognizer = createOcrRecognizer(currency, { workerFactory });

    expect(workerFactory).not.toHaveBeenCalled();
    await recognizer.prepare();

    expect(workerFactory).toHaveBeenCalledOnce();
    expect(workerFactory).toHaveBeenCalledWith(
      languages,
      expect.anything(),
      expect.objectContaining({
        langPath: "/ocr/tessdata_fast-4.1.0",
        gzip: true
      })
    );
  });

  it("preserves native marker text and exact word geometry", async () => {
    const ocrWorker = worker();
    const recognizer = createOcrRecognizer("KRW", {
      workerFactory: vi.fn().mockResolvedValue(ocrWorker)
    });

    expect(await recognizer.recognize(document.createElement("canvas"))).toEqual([
      {
        text: "가격 １，２３４원",
        confidence: 92,
        line: { blockIndex: 0, paragraphIndex: 0, lineIndex: 0 },
        box: { x: 14, y: 20, width: 118, height: 32 }
      }
    ]);
  });

  it("maps all twelve Source Currencies to one approved language family", () => {
    expect(Object.keys(OCR_LANGUAGE_PROFILES)).toEqual([
      "USD",
      "EUR",
      "JPY",
      "GBP",
      "CNY",
      "KRW",
      "TWD",
      "HKD",
      "AUD",
      "CAD",
      "SGD",
      "CHF"
    ]);
  });
});
