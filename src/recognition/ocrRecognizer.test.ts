import { describe, expect, it, vi } from "vitest";

import { createTestRecognitionProfile } from "../test/recognitionProfile";
import {
  createOcrRecognizer,
  verifyRecognitionAssets,
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
                        text: "１，２３４",
                        confidence: 92,
                        bbox: { x0: 14, y0: 20, x1: 112, y1: 52 }
                      },
                      {
                        text: "円",
                        confidence: 88,
                        bbox: { x0: 114, y0: 20, x1: 132, y1: 52 }
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

describe("Recognizer Adapter", () => {
  it("lazily loads exactly the frozen self-hosted recognizer configuration", async () => {
    const ocrWorker = worker();
    const workerFactory = vi.fn().mockResolvedValue(ocrWorker);
    const verifyAssets = vi.fn().mockResolvedValue(undefined);
    const recognizer = createOcrRecognizer(createTestRecognitionProfile(), {
      workerFactory,
      verifyAssets
    });

    expect(workerFactory).not.toHaveBeenCalled();
    await recognizer.prepare();

    expect(workerFactory).toHaveBeenCalledOnce();
    expect(verifyAssets).toHaveBeenCalledOnce();
    expect(workerFactory).toHaveBeenCalledWith(
      ["jpn", "eng"],
      expect.anything(),
      expect.objectContaining({
        workerPath: "/ocr/tesseract-7.0.0/worker.min.js",
        corePath: "/ocr/tesseract-core-7.0.0",
        langPath: "/ocr/tessdata_fast-4.1.0",
        gzip: true,
        cacheMethod: "none"
      })
    );
  });

  it("normalizes text and marker observations with polygons, timing, and pass identity", async () => {
    const timestamps = [10, 18];
    const recognizer = createOcrRecognizer(createTestRecognitionProfile(), {
      workerFactory: vi.fn().mockResolvedValue(worker()),
      verifyAssets: vi.fn().mockResolvedValue(undefined),
      now: () => timestamps.shift() ?? 18
    });
    const passIdentity = {
      kind: "guide" as const,
      frameIdentity: "frame-42",
      preprocessingIdentity: "raw"
    };

    expect(
      await recognizer.recognize(
        document.createElement("canvas"),
        passIdentity
      )
    ).toEqual([
      expect.objectContaining({
        text: "１，２３４",
        evidenceKind: "text",
        confidence: 92,
        line: { blockIndex: 0, paragraphIndex: 0, lineIndex: 0 },
        box: { x: 14, y: 20, width: 98, height: 32 },
        polygon: [
          { x: 14, y: 20 },
          { x: 112, y: 20 },
          { x: 112, y: 52 },
          { x: 14, y: 52 }
        ],
        timing: { startedAtMs: 10, completedAtMs: 18, durationMs: 8 },
        passIdentity
      }),
      expect.objectContaining({
        text: "円",
        evidenceKind: "marker",
        confidence: 88,
        box: { x: 114, y: 20, width: 18, height: 32 },
        timing: { startedAtMs: 10, completedAtMs: 18, durationMs: 8 },
        passIdentity
      })
    ]);
  });

  it("does not attempt another engine when initialization fails", async () => {
    const workerFactory = vi.fn().mockRejectedValue(new Error("unavailable"));
    const recognizer = createOcrRecognizer(createTestRecognitionProfile(), {
      workerFactory,
      verifyAssets: vi.fn().mockResolvedValue(undefined)
    });

    await expect(recognizer.prepare()).rejects.toThrow("unavailable");
    expect(workerFactory).toHaveBeenCalledOnce();
  });

  it("releases a worker that fails during initialization", async () => {
    const failedWorker = worker();
    failedWorker.setParameters.mockRejectedValueOnce(
      new Error("parameters unavailable")
    );
    const recognizer = createOcrRecognizer(createTestRecognitionProfile(), {
      workerFactory: vi.fn().mockResolvedValue(failedWorker),
      verifyAssets: vi.fn().mockResolvedValue(undefined)
    });

    await expect(recognizer.prepare()).rejects.toThrow(
      "parameters unavailable"
    );
    expect(failedWorker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects an asset whose bytes do not match its frozen hash", async () => {
    await expect(
      verifyRecognitionAssets(
        [
          {
            path: "/ocr/worker.js",
            hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          }
        ],
        {
          fetcher: vi.fn().mockResolvedValue(new Response("unexpected bytes"))
        }
      )
    ).rejects.toThrow(/hash mismatch/i);
  });
});
