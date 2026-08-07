import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { SourceCurrencyCode } from "../domain/currencies";
import type {
  OcrRecognizer,
  RecognizerObservation
} from "./ocrRecognizer";
import { UNIVERSAL_RECOGNITION_RUNTIME } from "./recognitionRuntime";
import { createRecognitionPreparation } from "./recognitionPreparation";
import { useCameraRecognition } from "./useCameraRecognition";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function video() {
  const element = document.createElement("video");
  Object.defineProperties(element, {
    videoWidth: { configurable: true, value: 1920 },
    videoHeight: { configurable: true, value: 1080 }
  });
  return element;
}

function preview() {
  const element = document.createElement("div");
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    width: 390,
    height: 844,
    x: 0,
    y: 0,
    top: 0,
    right: 390,
    bottom: 844,
    left: 0,
    toJSON: () => ({})
  });
  return element;
}

function canvasContext(drawImage = vi.fn()): CanvasRenderingContext2D {
  return {
    drawImage,
    getImageData: (
      _x: number,
      _y: number,
      width: number,
      height: number
    ) =>
      ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
        colorSpace: "srgb"
      }) as ImageData,
    createImageData: (width: number, height: number) =>
      ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
        colorSpace: "srgb"
      }) as ImageData,
    putImageData: vi.fn()
  } as unknown as CanvasRenderingContext2D;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("crops every Guide pass to the visible Capture Guide and discovery to the full preview", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const cameraVideo = video();
  Object.defineProperties(cameraVideo, {
    videoWidth: { configurable: true, value: 200 },
    videoHeight: { configurable: true, value: 100 }
  });
  const cameraPreview = document.createElement("div");
  vi.spyOn(cameraPreview, "getBoundingClientRect").mockReturnValue({
    width: 100,
    height: 100,
    x: 10,
    y: 20,
    top: 20,
    right: 110,
    bottom: 120,
    left: 10,
    toJSON: () => ({})
  });
  const captureGuide = document.createElement("div");
  vi.spyOn(captureGuide, "getBoundingClientRect").mockReturnValue({
    width: 50,
    height: 40,
    x: 35,
    y: 40,
    top: 40,
    right: 85,
    bottom: 80,
    left: 35,
    toJSON: () => ({})
  });
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    canvasContext(drawImage)
  );
  const recognizer: OcrRecognizer = {
    prepare: vi.fn().mockResolvedValue(undefined),
    recognize: vi.fn().mockResolvedValue([]),
    terminate: vi.fn().mockResolvedValue(undefined)
  };
  const createRecognizer = () => recognizer;
  const preparation = createRecognitionPreparation({
    runtime: UNIVERSAL_RECOGNITION_RUNTIME,
    createRecognizer
  });

  const { unmount } = renderHook(() =>
    useCameraRecognition({
      enabled: true,
      runtime: UNIVERSAL_RECOGNITION_RUNTIME,
      sourceCurrency: "JPY",
      video: cameraVideo,
      preview: cameraPreview,
      captureGuide,
      preparation
    })
  );

  await act(async () => {
    await Promise.resolve();
  });
  expect(drawImage).toHaveBeenNthCalledWith(
    1,
    cameraVideo,
    75,
    20,
    50,
    40,
    0,
    0,
    50,
    40
  );

  await act(async () => vi.advanceTimersToNextTimerAsync());
  await act(async () => vi.advanceTimersToNextTimerAsync());
  await act(async () => vi.advanceTimersToNextTimerAsync());
  expect(drawImage).toHaveBeenCalledWith(
    cameraVideo,
    50,
    0,
    100,
    100,
    0,
    0,
    100,
    100
  );
  expect(recognizer.recognize).toHaveBeenCalledWith(
    expect.any(HTMLCanvasElement),
    expect.objectContaining({ kind: "discovery" })
  );

  unmount();
  preparation.dispose();
});

it("publishes only stable Detected Prices from distinct completed frames", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    canvasContext()
  );
  const slowFirstRecognition = deferred<RecognizerObservation[]>();
  const slowSecondRecognition = deferred<RecognizerObservation[]>();
  let firstFrameIdentity: string | null = null;
  let delayedFirstResult: RecognizerObservation[] = [];
  let delayedSecondResult: RecognizerObservation[] = [];
  let delayedSecondPass = false;
  const recognizer: OcrRecognizer = {
    prepare: vi.fn().mockResolvedValue(undefined),
    recognize: vi.fn((_image, passIdentity) => {
      const recognized = observation();
      const scale = passIdentity.preprocessingIdentity === "raw" ? 1 : 2;
      const result = [
        {
          ...recognized,
          box: {
            x: recognized.box.x * scale,
            y: recognized.box.y * scale,
            width: recognized.box.width * scale,
            height: recognized.box.height * scale
          },
          polygon: recognized.polygon.map(({ x, y }) => ({
            x: x * scale,
            y: y * scale
          })) as unknown as RecognizerObservation["polygon"]
        }
      ];
      if (firstFrameIdentity === null) {
        firstFrameIdentity = passIdentity.frameIdentity;
        delayedFirstResult = result;
        return slowFirstRecognition.promise;
      }
      if (
        passIdentity.frameIdentity !== firstFrameIdentity &&
        !delayedSecondPass
      ) {
        delayedSecondPass = true;
        delayedSecondResult = result;
        return slowSecondRecognition.promise;
      }
      return Promise.resolve(result);
    }),
    terminate: vi.fn().mockResolvedValue(undefined)
  };
  const cameraPreview = preview();
  const cameraVideo = video();
  const createRecognizer = () => recognizer;
  const preparation = createRecognitionPreparation({
    runtime: UNIVERSAL_RECOGNITION_RUNTIME,
    createRecognizer
  });

  const { result, unmount } = renderHook(() =>
    useCameraRecognition({
      enabled: true,
      runtime: UNIVERSAL_RECOGNITION_RUNTIME,
      sourceCurrency: "JPY",
      video: cameraVideo,
      preview: cameraPreview,
      captureGuide: cameraPreview,
      preparation
    })
  );

  await act(async () => vi.advanceTimersByTimeAsync(5_000));
  expect(result.current.candidateOutlines).toEqual([]);
  await act(async () => {
    slowFirstRecognition.resolve(delayedFirstResult);
    await Promise.resolve();
  });
  expect(result.current.phase).toBe("stabilizing");
  expect(result.current.candidateOutlines).toEqual([
    expect.objectContaining({
      state: "candidate",
      label: "Possible price"
    })
  ]);
  expect(result.current.detectedPrices).toEqual([]);
  expect(result.current.focusedPrice).toBeNull();

  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(delayedSecondPass).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(1_250));
  expect(result.current.phase).toBe("searching");
  expect(result.current.candidateOutlines).toEqual([]);
  expect(result.current.detectedPrices).toEqual([]);

  await act(async () => {
    slowSecondRecognition.resolve(delayedSecondResult);
    await Promise.resolve();
  });
  expect(result.current.phase).toBe("focused");
  expect(result.current.detectedPrices).toEqual([
    expect.objectContaining({
      identity: "detected-price-1",
      currency: "JPY",
      minorUnits: 4142
    })
  ]);
  expect(result.current.focusedPrice).toBe(
    result.current.detectedPrices[0]
  );

  unmount();
  preparation.dispose();
});

it("clears provisional presentation when a genuine OCR pass fails", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    canvasContext()
  );
  let firstFrameIdentity: string | null = null;
  const recognizer: OcrRecognizer = {
    prepare: vi.fn().mockResolvedValue(undefined),
    recognize: vi.fn((_image, passIdentity) => {
      firstFrameIdentity ??= passIdentity.frameIdentity;
      return passIdentity.frameIdentity === firstFrameIdentity
        ? Promise.resolve([observation()])
        : Promise.reject(new Error("genuine OCR failure"));
    }),
    terminate: vi.fn().mockResolvedValue(undefined)
  };
  const preparation = createRecognitionPreparation({
    runtime: UNIVERSAL_RECOGNITION_RUNTIME,
    createRecognizer: () => recognizer
  });
  const cameraVideo = video();
  const cameraPreview = preview();
  const { result, unmount } = renderHook(() =>
    useCameraRecognition({
      enabled: true,
      runtime: UNIVERSAL_RECOGNITION_RUNTIME,
      sourceCurrency: "JPY",
      video: cameraVideo,
      preview: cameraPreview,
      captureGuide: cameraPreview,
      preparation
    })
  );

  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(result.current.phase).toBe("stabilizing");
  expect(result.current.candidateOutlines.length).toBeGreaterThan(0);
  await act(async () => vi.advanceTimersByTimeAsync(1_000));
  expect(result.current.phase).toBe("error");
  expect(result.current.candidateOutlines).toEqual([]);
  await act(async () => vi.advanceTimersByTimeAsync(2_000));
  expect(result.current.phase).toBe("error");

  unmount();
  preparation.dispose();
});

function observation(): RecognizerObservation {
  return {
    text: "4,142円",
    evidenceKind: "text",
    confidence: 96,
    line: { blockIndex: 0, paragraphIndex: 0, lineIndex: 0 },
    box: { x: 170, y: 500, width: 160, height: 80 },
    polygon: [
      { x: 170, y: 500 },
      { x: 330, y: 500 },
      { x: 330, y: 580 },
      { x: 170, y: 580 }
    ],
    timing: { startedAtMs: 1, completedAtMs: 2, durationMs: 1 },
    passIdentity: {
      kind: "guide",
      frameIdentity: "frame-1",
      preprocessingIdentity: "raw"
    }
  };
}

it("serializes generations and discards their stale results", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    canvasContext()
  );
  const staleRecognition = deferred<RecognizerObservation[]>();
  let activeRecognitions = 0;
  let maximumActiveRecognitions = 0;
  const recognize = vi
    .fn<() => Promise<RecognizerObservation[]>>()
    .mockImplementationOnce(async () => {
      activeRecognitions += 1;
      maximumActiveRecognitions = Math.max(
        maximumActiveRecognitions,
        activeRecognitions
      );
      const result = await staleRecognition.promise;
      activeRecognitions -= 1;
      return result;
    })
    .mockImplementation(async () => {
      activeRecognitions += 1;
      maximumActiveRecognitions = Math.max(
        maximumActiveRecognitions,
        activeRecognitions
      );
      activeRecognitions -= 1;
      return [];
    });
  const recognizer: OcrRecognizer = {
    prepare: vi.fn().mockResolvedValue(undefined),
    recognize,
    terminate: vi.fn().mockResolvedValue(undefined)
  };
  const createRecognizer = vi.fn(() => recognizer);
  const preparation = createRecognitionPreparation({
    runtime: UNIVERSAL_RECOGNITION_RUNTIME,
    createRecognizer
  });
  const firstVideo = video();
  const secondVideo = video();
  const cameraPreview = preview();
  interface HookProps {
    sourceCurrency: SourceCurrencyCode;
    cameraVideo: HTMLVideoElement;
    restartKey: number;
  }

  const { result, rerender, unmount } = renderHook(
    ({ sourceCurrency, cameraVideo, restartKey }: HookProps) =>
      useCameraRecognition({
        enabled: true,
        runtime: UNIVERSAL_RECOGNITION_RUNTIME,
        sourceCurrency,
        video: cameraVideo,
        preview: cameraPreview,
        captureGuide: cameraPreview,
        preparation,
        recognitionRestartKey: restartKey
      }),
    {
      initialProps: {
        sourceCurrency: "JPY",
        cameraVideo: firstVideo,
        restartKey: 0
      }
    }
  );

  await waitFor(() =>
    expect(recognizer.recognize).toHaveBeenCalledOnce()
  );
  rerender({
    sourceCurrency: "USD",
    cameraVideo: firstVideo,
    restartKey: 0
  });
  expect(createRecognizer).toHaveBeenCalledOnce();
  expect(recognizer.recognize).toHaveBeenCalledOnce();

  await act(async () => staleRecognition.resolve([observation()]));
  await waitFor(() =>
    expect(recognize.mock.calls.length).toBeGreaterThanOrEqual(6)
  );
  expect(result.current.focusedPrice).toBeNull();
  expect(maximumActiveRecognitions).toBe(1);

  rerender({
    sourceCurrency: "USD",
    cameraVideo: secondVideo,
    restartKey: 0
  });
  const callsAfterSourceChange = recognize.mock.calls.length;

  rerender({
    sourceCurrency: "USD",
    cameraVideo: secondVideo,
    restartKey: 1
  });
  await waitFor(() =>
    expect(recognize.mock.calls.length).toBeGreaterThan(
      callsAfterSourceChange
    )
  );

  unmount();
  expect(recognizer.terminate).not.toHaveBeenCalled();
  preparation.dispose();
  await waitFor(() => expect(recognizer.terminate).toHaveBeenCalledOnce());
  expect(createRecognizer).toHaveBeenCalledOnce();
}, 15_000);
