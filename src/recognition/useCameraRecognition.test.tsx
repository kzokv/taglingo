import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { createTestRecognitionProfile } from "../test/recognitionProfile";
import type {
  OcrRecognizer,
  RecognizerObservation
} from "./ocrRecognizer";
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
  const profile = createTestRecognitionProfile();
  const createRecognizer = () => recognizer;

  const { unmount } = renderHook(() =>
    useCameraRecognition({
      enabled: true,
      profile,
      video: cameraVideo,
      preview: cameraPreview,
      captureGuide,
      createRecognizer
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
});

it("publishes only stable Detected Prices from distinct completed frames", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    canvasContext()
  );
  const recognizer: OcrRecognizer = {
    prepare: vi.fn().mockResolvedValue(undefined),
    recognize: vi.fn(async (_image, passIdentity) => {
      const recognized = observation();
      const scale = passIdentity.preprocessingIdentity === "raw" ? 1 : 2;
      return [
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
    }),
    terminate: vi.fn().mockResolvedValue(undefined)
  };
  const cameraPreview = preview();
  const cameraVideo = video();
  const profile = createTestRecognitionProfile();
  const createRecognizer = () => recognizer;

  const { result, unmount } = renderHook(() =>
    useCameraRecognition({
      enabled: true,
      profile,
      video: cameraVideo,
      preview: cameraPreview,
      captureGuide: cameraPreview,
      createRecognizer
    })
  );

  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(result.current.phase).toBe("stabilizing");
  expect(result.current.detectedPrices).toEqual([]);
  expect(result.current.focusedPrice).toBeNull();

  await act(async () => vi.advanceTimersByTimeAsync(1_500));
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
});

function observation(): RecognizerObservation {
  return {
    text: "4,142円",
    evidenceKind: "text",
    confidence: 96,
    line: { blockIndex: 0, paragraphIndex: 0, lineIndex: 0 },
    box: { x: 592, y: 111, width: 160, height: 80 },
    polygon: [
      { x: 592, y: 111 },
      { x: 752, y: 111 },
      { x: 752, y: 191 },
      { x: 592, y: 191 }
    ],
    timing: { startedAtMs: 1, completedAtMs: 2, durationMs: 1 },
    passIdentity: {
      kind: "guide",
      frameIdentity: "frame-1",
      preprocessingIdentity: "raw"
    }
  };
}

it("releases prior generations and discards their stale results", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    canvasContext()
  );
  const staleRecognition = deferred<RecognizerObservation[]>();
  const firstRelease = deferred<void>();
  const firstRecognizer: OcrRecognizer = {
    prepare: vi.fn().mockResolvedValue(undefined),
    recognize: vi.fn().mockReturnValueOnce(staleRecognition.promise),
    terminate: vi.fn().mockReturnValue(firstRelease.promise)
  };
  const nextRecognizer = (): OcrRecognizer => ({
    prepare: vi.fn().mockResolvedValue(undefined),
    recognize: vi.fn().mockResolvedValue([]),
    terminate: vi.fn().mockResolvedValue(undefined)
  });
  const secondRecognizer = nextRecognizer();
  const thirdRecognizer = nextRecognizer();
  const fourthRecognizer = nextRecognizer();
  const recognizers = [
    firstRecognizer,
    secondRecognizer,
    thirdRecognizer,
    fourthRecognizer
  ];
  const createRecognizer = vi.fn(() => recognizers.shift()!);
  const firstProfile = createTestRecognitionProfile({ id: "jpy-ios-v1" });
  const secondProfile = createTestRecognitionProfile({
    id: "usd-android-v2",
    sourceCurrency: "USD",
    platform: "android"
  });
  const firstVideo = video();
  const secondVideo = video();
  const cameraPreview = preview();

  const { result, rerender, unmount } = renderHook(
    ({ profile, cameraVideo, restartKey }) =>
      useCameraRecognition({
        enabled: true,
        profile,
        video: cameraVideo,
        preview: cameraPreview,
        captureGuide: cameraPreview,
        createRecognizer,
        recognitionRestartKey: restartKey
      }),
    {
      initialProps: {
        profile: firstProfile,
        cameraVideo: firstVideo,
        restartKey: 0
      }
    }
  );

  await waitFor(() =>
    expect(firstRecognizer.recognize).toHaveBeenCalledOnce()
  );
  rerender({
    profile: secondProfile,
    cameraVideo: firstVideo,
    restartKey: 0
  });
  await waitFor(() => expect(firstRecognizer.terminate).toHaveBeenCalledOnce());
  expect(createRecognizer).toHaveBeenCalledOnce();

  await act(async () => firstRelease.resolve());
  await waitFor(() => expect(createRecognizer).toHaveBeenCalledTimes(2));
  expect(createRecognizer).toHaveBeenLastCalledWith(
    secondProfile,
    expect.any(Function)
  );

  await act(async () => staleRecognition.resolve([observation()]));
  expect(result.current.focusedPrice).toBeNull();

  rerender({
    profile: secondProfile,
    cameraVideo: secondVideo,
    restartKey: 0
  });
  await waitFor(() => expect(createRecognizer).toHaveBeenCalledTimes(3));
  expect(secondRecognizer.terminate).toHaveBeenCalledOnce();

  rerender({
    profile: secondProfile,
    cameraVideo: secondVideo,
    restartKey: 1
  });
  await waitFor(() => expect(createRecognizer).toHaveBeenCalledTimes(4));
  expect(thirdRecognizer.terminate).toHaveBeenCalledOnce();

  unmount();
  await waitFor(() => expect(fourthRecognizer.terminate).toHaveBeenCalledOnce());
  expect(recognizers).toHaveLength(0);
});
