import { describe, expect, it, vi } from "vitest";

import type { OcrRecognizer } from "./ocrRecognizer";
import { createRecognitionPreparation } from "./recognitionPreparation";
import { UNIVERSAL_RECOGNITION_RUNTIME } from "./recognitionRuntime";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function recognizerWithPreparation(preparation: Promise<void>): OcrRecognizer {
  return {
    prepare: vi.fn(() => preparation),
    recognize: vi.fn().mockResolvedValue([]),
    terminate: vi.fn().mockResolvedValue(undefined)
  };
}

describe("Recognition preparation", () => {
  it("starts one shared preparation and publishes monotonic progress", async () => {
    const pending = deferred<void>();
    const recognizer = recognizerWithPreparation(pending.promise);
    let progress: (value: number, status: string) => void = () => undefined;
    const createRecognizer = vi.fn((_runtime, onProgress) => {
      progress = onProgress;
      return recognizer;
    });
    const preparation = createRecognitionPreparation({
      runtime: UNIVERSAL_RECOGNITION_RUNTIME,
      createRecognizer
    });
    const snapshots = [preparation.getSnapshot()];
    preparation.subscribe((snapshot) => snapshots.push(snapshot));

    const first = preparation.prepare();
    const second = preparation.prepare();
    progress(0.6, "loading model");
    progress(0.3, "older progress");

    expect(createRecognizer).toHaveBeenCalledOnce();
    expect(recognizer.prepare).toHaveBeenCalledOnce();
    expect(preparation.getSnapshot()).toMatchObject({
      phase: "preparing",
      progress: 0.6
    });

    pending.resolve();
    await expect(first).resolves.toBe(recognizer);
    await expect(second).resolves.toBe(recognizer);
    expect(preparation.getSnapshot()).toEqual({ phase: "ready", progress: 1 });
    expect(snapshots.map(({ phase }) => phase)).toContain("preparing");
  });

  it("retries after failure and terminates only the failed recognizer", async () => {
    const failed = recognizerWithPreparation(
      Promise.reject(new Error("runtime unavailable"))
    );
    const recovered = recognizerWithPreparation(Promise.resolve());
    const createRecognizer = vi
      .fn()
      .mockReturnValueOnce(failed)
      .mockReturnValueOnce(recovered);
    const preparation = createRecognitionPreparation({
      runtime: UNIVERSAL_RECOGNITION_RUNTIME,
      createRecognizer
    });

    await expect(preparation.prepare()).rejects.toThrow("runtime unavailable");
    expect(preparation.getSnapshot().phase).toBe("error");
    expect(failed.terminate).toHaveBeenCalledOnce();

    await expect(preparation.retry()).resolves.toBe(recovered);
    expect(createRecognizer).toHaveBeenCalledTimes(2);
    expect(preparation.getSnapshot().phase).toBe("ready");
    expect(recovered.terminate).not.toHaveBeenCalled();
  });

  it("finishes releasing a ready runtime before one replacement preparation", async () => {
    const release = deferred<void>();
    const first = recognizerWithPreparation(Promise.resolve());
    vi.mocked(first.terminate).mockReturnValue(release.promise);
    const replacement = recognizerWithPreparation(Promise.resolve());
    const createRecognizer = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(replacement);
    const preparation = createRecognitionPreparation({
      runtime: UNIVERSAL_RECOGNITION_RUNTIME,
      createRecognizer
    });
    await preparation.prepare();

    const retry = preparation.retry();
    const concurrentAcquire = preparation.prepare();
    expect(createRecognizer).toHaveBeenCalledOnce();

    release.resolve();
    await expect(retry).resolves.toBe(replacement);
    await expect(concurrentAcquire).resolves.toBe(replacement);
    expect(createRecognizer).toHaveBeenCalledTimes(2);
  });

  it("cancels publication and releases a preparation that finishes after disposal", async () => {
    const pending = deferred<void>();
    const recognizer = recognizerWithPreparation(pending.promise);
    const preparation = createRecognitionPreparation({
      runtime: UNIVERSAL_RECOGNITION_RUNTIME,
      createRecognizer: () => recognizer
    });
    const listener = vi.fn();
    preparation.subscribe(listener);

    const result = preparation.prepare();
    preparation.dispose();
    pending.resolve();

    await expect(result).rejects.toThrow("disposed");
    expect(recognizer.terminate).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
