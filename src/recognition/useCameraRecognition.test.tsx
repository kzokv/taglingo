import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

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
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn()
  } as unknown as CanvasRenderingContext2D);
  const staleRecognition = deferred<RecognizerObservation[]>();
  const firstRecognizer: OcrRecognizer = {
    prepare: vi.fn().mockResolvedValue(undefined),
    recognize: vi
      .fn()
      .mockResolvedValueOnce([observation()])
      .mockReturnValueOnce(staleRecognition.promise),
    terminate: vi.fn().mockResolvedValue(undefined)
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
    expect(firstRecognizer.recognize).toHaveBeenCalledTimes(2)
  );
  rerender({
    profile: secondProfile,
    cameraVideo: firstVideo,
    restartKey: 0
  });
  await waitFor(() => expect(firstRecognizer.terminate).toHaveBeenCalledOnce());
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
  expect(fourthRecognizer.terminate).toHaveBeenCalledOnce();
  expect(recognizers).toHaveLength(0);
});
