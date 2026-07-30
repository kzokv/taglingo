import { expect, it, vi } from "vitest";

import {
  createJpyOcrRecognizer,
  OCR_ASSET_PATHS,
  type OcrWorker
} from "./jpyOcrRecognizer";

it("uses one self-hosted JPY worker and returns word-level token boxes", async () => {
  const recognize = vi.fn().mockResolvedValue({
    data: {
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                {
                  words: [
                    {
                      text: "4,142円",
                      confidence: 93,
                      bbox: { x0: 18, y0: 9, x1: 104, y1: 37 }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  });
  const terminate = vi.fn().mockResolvedValue(undefined);
  const setParameters = vi.fn().mockResolvedValue(undefined);
  const workerFactory = vi.fn().mockResolvedValue({
    recognize,
    setParameters,
    terminate
  } satisfies OcrWorker);
  const recognizer = createJpyOcrRecognizer({ workerFactory });
  const image = document.createElement("canvas");

  expect(await recognizer.recognize(image)).toEqual([
    {
      text: "4,142円",
      confidence: 93,
      line: { blockIndex: 0, paragraphIndex: 0, lineIndex: 0 },
      box: { x: 18, y: 9, width: 86, height: 28 }
    }
  ]);
  await recognizer.recognize(image, "discovery");

  expect(workerFactory).toHaveBeenCalledTimes(1);
  expect(workerFactory).toHaveBeenCalledWith(
    ["jpn", "eng"],
    expect.anything(),
    expect.objectContaining({
      workerPath: OCR_ASSET_PATHS.worker,
      corePath: OCR_ASSET_PATHS.core,
      langPath: OCR_ASSET_PATHS.languages,
      gzip: true
    })
  );
  expect(setParameters).toHaveBeenCalledWith({
    tessedit_pageseg_mode: "11"
  });
  await recognizer.terminate();
  expect(terminate).toHaveBeenCalledOnce();
});
