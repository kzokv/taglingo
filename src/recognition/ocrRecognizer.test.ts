import { describe, expect, it, vi } from "vitest";

import {
  createOcrRecognizer,
  verifyRecognitionAssets,
  type OcrWorker
} from "./ocrRecognizer";
import { UNIVERSAL_RECOGNITION_RUNTIME } from "./recognitionRuntime";

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
    const recognizer = createOcrRecognizer(UNIVERSAL_RECOGNITION_RUNTIME, {
      workerFactory,
      verifyAssets
    });

    expect(workerFactory).not.toHaveBeenCalled();
    await recognizer.prepare();

    expect(workerFactory).toHaveBeenCalledOnce();
    expect(verifyAssets).toHaveBeenCalledOnce();
    expect(workerFactory).toHaveBeenCalledWith(
      ["eng", "jpn", "chi_sim", "chi_tra", "kor"],
      expect.anything(),
      expect.objectContaining({
        workerPath: "/ocr/tesseract-7.0.0/worker.min.js",
        corePath: "/ocr/tesseract-core-7.0.0",
        langPath: "/ocr/tessdata_fast-4.1.0",
        gzip: true,
        workerBlobURL: true,
        cacheMethod: "none"
      })
    );
  });

  it("returns currency-neutral text observations with polygons, timing, and pass identity", async () => {
    const timestamps = [10, 18];
    const recognizer = createOcrRecognizer(UNIVERSAL_RECOGNITION_RUNTIME, {
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
        evidenceKind: "text",
        confidence: 88,
        box: { x: 114, y: 20, width: 18, height: 32 },
        timing: { startedAtMs: 10, completedAtMs: 18, durationMs: 8 },
        passIdentity
      })
    ]);
  });

  it("does not attempt another engine when initialization fails", async () => {
    const workerFactory = vi.fn().mockRejectedValue(new Error("unavailable"));
    const recognizer = createOcrRecognizer(UNIVERSAL_RECOGNITION_RUNTIME, {
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
    const recognizer = createOcrRecognizer(UNIVERSAL_RECOGNITION_RUNTIME, {
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

  it("requests pinned assets from the same origin through the browser cache", async () => {
    const bytes = new TextEncoder().encode("cached runtime bytes");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = `sha256:${Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")}` as const;
    const fetcher = vi.fn().mockResolvedValue(new Response(bytes));

    await verifyRecognitionAssets(
      [{ path: "/ocr/runtime.wasm", hash }],
      { fetcher }
    );

    expect(fetcher).toHaveBeenCalledWith("/ocr/runtime.wasm", {
      credentials: "same-origin",
      cache: "force-cache"
    });
  });

  it("validates decoded browser bytes when HTTP applies gzip content encoding", async () => {
    const decodedBytes = new TextEncoder().encode("decoded model bytes");
    await expect(
      verifyRecognitionAssets(
        [
          {
            path: "/ocr/eng.traineddata.gz",
            hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            decodedHash:
              "sha256:e448702be15b6819d770e81d254dd0211081ae5cccef71a8c46294fc67cdabf5"
          }
        ],
        {
          fetcher: vi.fn().mockResolvedValue(
            new Response(decodedBytes, {
              headers: { "content-encoding": "gzip" }
            })
          )
        }
      )
    ).resolves.toBeUndefined();
  });

  it("validates a plain pinned asset after transparent HTTP gzip decoding", async () => {
    const decodedBytes = new TextEncoder().encode("plain worker bytes");

    await expect(
      verifyRecognitionAssets(
        [
          {
            path: "/ocr/worker.min.js",
            hash:
              "sha256:0d93f7e2f2e7be9dbe75261f7c66f9e34e89a1a58917b6ba7c7904fbf5db9166"
          }
        ],
        {
          fetcher: vi.fn().mockResolvedValue(
            new Response(decodedBytes, {
              headers: { "content-encoding": "gzip" }
            })
          )
        }
      )
    ).resolves.toBeUndefined();
  });

  it("does not accept the decoded hash without declared HTTP content encoding", async () => {
    const decodedBytes = new TextEncoder().encode("decoded model bytes");
    await expect(
      verifyRecognitionAssets(
        [
          {
            path: "/ocr/eng.traineddata.gz",
            hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            decodedHash:
              "sha256:e448702be15b6819d770e81d254dd0211081ae5cccef71a8c46294fc67cdabf5"
          }
        ],
        { fetcher: vi.fn().mockResolvedValue(new Response(decodedBytes)) }
      )
    ).rejects.toThrow(/hash mismatch/i);
  });
});
