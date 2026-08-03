import { describe, expect, it, vi } from "vitest";

import { mapSampleBoxToPreview } from "../camera/previewGeometry";
import { JPY_COMPARISON_PROFILES } from "./comparisonProfiles";
import {
  createPaddleOcrRecognizer,
  normalizePaddleRecordedOutput,
  type PaddleOcrRunner
} from "./paddleOcrRecognizer";

const profile = JPY_COMPARISON_PROFILES[0];
const passIdentity = {
  kind: "guide" as const,
  frameIdentity: "frame-42",
  preprocessingIdentity: "raw"
};

const recordedOutput = {
  image: { width: 640, height: 360 },
  items: [
    {
      poly: [
        [20, 30],
        [120, 28],
        [122, 60],
        [18, 62]
      ] as const,
      text: "１，２３４",
      score: 0.93
    },
    {
      poly: [
        [124, 29],
        [142, 29],
        [142, 61],
        [124, 61]
      ] as const,
      text: "円",
      score: 0.89
    }
  ],
  metrics: {
    detMs: 4,
    recMs: 7,
    totalMs: 11,
    detectedBoxes: 2,
    recognizedCount: 2
  },
  runtime: {
    requestedBackend: "wasm",
    detProvider: "wasm",
    recProvider: "wasm",
    webgpuAvailable: false
  }
};

describe("PaddleOCR.js Recognizer Adapter", () => {
  it("normalizes recorded SDK output without deciding Detected or Focused Price state", () => {
    const observations = normalizePaddleRecordedOutput(
      profile,
      recordedOutput,
      passIdentity,
      { startedAtMs: 10, completedAtMs: 22 }
    );

    expect(observations).toEqual([
      expect.objectContaining({
        text: "１，２３４",
        evidenceKind: "text",
        confidence: 93,
        box: { x: 18, y: 28, width: 104, height: 34 },
        polygon: [
          { x: 20, y: 30 },
          { x: 120, y: 28 },
          { x: 122, y: 60 },
          { x: 18, y: 62 }
        ],
        timing: { startedAtMs: 10, completedAtMs: 22, durationMs: 12 },
        passIdentity
      }),
      expect.objectContaining({
        text: "円",
        evidenceKind: "marker",
        confidence: 89,
        passIdentity
      })
    ]);
    expect(observations[0]).not.toHaveProperty("detectedPrice");
    expect(observations[0]).not.toHaveProperty("focusedPrice");
  });

  it("feeds normalized polygon bounds into the existing preview mapping contract", () => {
    const [observation] = normalizePaddleRecordedOutput(
      profile,
      recordedOutput,
      passIdentity,
      { startedAtMs: 10, completedAtMs: 22 }
    );

    expect(
      mapSampleBoxToPreview(
        observation.box,
        { x: 100, y: 50, width: 640, height: 360 },
        { width: 1280, height: 720 },
        { width: 640, height: 360 }
      )
    ).toEqual({ x: 59, y: 39, width: 52, height: 17 });
  });

  it("loads only the frozen official SDK configuration", async () => {
    const runner: PaddleOcrRunner = {
      initialize: vi.fn().mockResolvedValue(undefined),
      predict: vi.fn().mockResolvedValue([recordedOutput]),
      dispose: vi.fn().mockResolvedValue(undefined)
    };
    const runnerFactory = vi.fn().mockResolvedValue(runner);
    const recognizer = createPaddleOcrRecognizer(profile, {
      runnerFactory,
      verifyAssets: vi.fn().mockResolvedValue(undefined),
      now: () => 10
    });

    await recognizer.prepare();
    await recognizer.recognize(document.createElement("canvas"), passIdentity);

    expect(runnerFactory).toHaveBeenCalledOnce();
    expect(runnerFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        worker: expect.any(Object),
        textDetectionModelName: "PP-OCRv6_small_det",
        textRecognitionModelName: "PP-OCRv6_small_rec",
        textDetectionModelAsset: {
          url: "/ocr/paddleocr/PP-OCRv6_small_det_onnx_infer.tar"
        },
        textRecognitionModelAsset: {
          url: "/ocr/paddleocr/PP-OCRv6_small_rec_onnx_infer.tar"
        },
        ortOptions: expect.objectContaining({
          backend: "wasm",
          wasmPaths: "/ocr/onnxruntime-web-1.24.3/"
        })
      })
    );
    const options = runnerFactory.mock.calls[0][0];
    const workerFactory = (
      options.worker as { createWorker: () => Worker }
    ).createWorker;
    const createWorker = vi.fn();
    vi.stubGlobal("Worker", createWorker);
    workerFactory();
    expect(createWorker).toHaveBeenCalledWith(
      "/ocr/comparison/paddle-worker-same-origin.v1.js",
      { type: "module" }
    );
    vi.unstubAllGlobals();
    expect(runner.predict).toHaveBeenCalledOnce();
  });

  it("wires the same-origin guard into actual profile asset preparation", async () => {
    const unsafeProfile = {
      ...profile,
      assets: [
        {
          ...profile.assets[0],
          path: "https://cdn.example.com/camera-derived-model.tar"
        }
      ]
    } as unknown as typeof profile;
    const runnerFactory = vi.fn();
    const fetcher = vi.fn();
    const recognizer = createPaddleOcrRecognizer(unsafeProfile, {
      runnerFactory,
      origin: "https://taglingo.test",
      fetcher
    });

    await expect(recognizer.prepare()).rejects.toThrow(/third-party/i);
    expect(fetcher).not.toHaveBeenCalled();
    expect(runnerFactory).not.toHaveBeenCalled();
  });
});
