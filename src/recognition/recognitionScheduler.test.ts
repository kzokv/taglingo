import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRecognitionScheduler,
  type RecognitionPassRequest
} from "./recognitionScheduler";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

interface CapturedFrame {
  id: string;
  kind: RecognitionPassRequest["kind"];
}

function schedulerHarness({
  runPass = vi.fn(async (frame: CapturedFrame) => `result:${frame.id}`)
}: {
  runPass?: ReturnType<
    typeof vi.fn<(frame: CapturedFrame) => Promise<string>>
  >;
} = {}) {
  const captures: RecognitionPassRequest[] = [];
  const results: string[] = [];
  const errors: unknown[] = [];
  const scheduler = createRecognitionScheduler<CapturedFrame, string>({
    capturePass(request) {
      captures.push(request);
      return { id: request.frameIdentity, kind: request.kind };
    },
    runPass,
    onResult: (result) => results.push(result),
    onError: (error) => errors.push(error),
    now: () => Date.now()
  });
  return { captures, errors, results, runPass, scheduler };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Recognition Scheduler", () => {
  it("uses the approved state-dependent Guide and discovery intervals", async () => {
    const { captures, scheduler } = schedulerHarness();

    scheduler.start("session-1");
    await vi.advanceTimersByTimeAsync(3_999);
    expect(
      captures.map(({ kind, capturedAtMs }) => [kind, capturedAtMs])
    ).toEqual([
      ["guide", 0],
      ["guide", 1_500],
      ["guide", 3_000]
    ]);

    await vi.advanceTimersByTimeAsync(1);
    expect(captures.at(-1)).toMatchObject({
      kind: "discovery",
      capturedAtMs: 4_000
    });

    scheduler.setState("focused");
    await vi.advanceTimersByTimeAsync(999);
    expect(captures.at(-1)?.capturedAtMs).toBe(4_000);
    await vi.advanceTimersByTimeAsync(1);
    expect(captures.at(-1)).toMatchObject({
      kind: "guide",
      capturedAtMs: 5_000
    });

    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(captures).toContainEqual(
      expect.objectContaining({
        kind: "discovery",
        capturedAtMs: 9_000
      })
    );
  });

  it("prioritizes the Candidate Outline pass kind before it expires", async () => {
    const { captures, scheduler } = schedulerHarness();

    scheduler.start("session-1");
    scheduler.setState("focused", "discovery");
    await vi.advanceTimersByTimeAsync(999);
    expect(captures).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(captures.at(-1)).toMatchObject({
      kind: "discovery",
      capturedAtMs: 1_000
    });
  });

  it("runs one slow pass at a time and replaces pending work with the newest frame", async () => {
    const slowPass = deferred<string>();
    const runPass = vi
      .fn<(frame: CapturedFrame) => Promise<string>>()
      .mockReturnValueOnce(slowPass.promise)
      .mockImplementation(async (frame) => `result:${frame.id}`);
    const { captures, results, scheduler } = schedulerHarness({ runPass });

    scheduler.start("session-1");
    await vi.advanceTimersByTimeAsync(3_000);

    expect(captures.map(({ frameIdentity }) => frameIdentity)).toEqual([
      "session-1:frame-1",
      "session-1:frame-2",
      "session-1:frame-3"
    ]);
    expect(runPass).toHaveBeenCalledTimes(1);

    slowPass.resolve("result:session-1:frame-1");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(249);
    expect(runPass).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(runPass.mock.calls.map(([frame]) => frame.id)).toEqual([
      "session-1:frame-1",
      "session-1:frame-3"
    ]);
    expect(results).toEqual([
      "result:session-1:frame-1",
      "result:session-1:frame-3"
    ]);
  });

  it("does not let newer Guide frames starve an overdue discovery pass", async () => {
    const slowGuide = deferred<string>();
    const runPass = vi
      .fn<(frame: CapturedFrame) => Promise<string>>()
      .mockReturnValueOnce(slowGuide.promise)
      .mockImplementation(async (frame) => `result:${frame.id}`);
    const { scheduler } = schedulerHarness({ runPass });

    scheduler.start("session-1");
    await vi.advanceTimersByTimeAsync(4_500);
    slowGuide.resolve("result:slow-guide");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    expect(runPass.mock.calls.map(([frame]) => frame.kind)).toEqual([
      "guide",
      "guide",
      "discovery"
    ]);
  });

  it("cancels pending work and rejects a completed result after disposal", async () => {
    const slowPass = deferred<string>();
    const runPass = vi.fn(() => slowPass.promise);
    const { results, scheduler } = schedulerHarness({ runPass });

    scheduler.start("session-1");
    await vi.advanceTimersByTimeAsync(1_500);
    scheduler.dispose();
    slowPass.resolve("stale result");
    await vi.runAllTimersAsync();

    expect(runPass).toHaveBeenCalledOnce();
    expect(results).toEqual([]);
  });

  it("drops pending and completed work from an older generation", async () => {
    const stalePass = deferred<string>();
    const runPass = vi
      .fn<(frame: CapturedFrame) => Promise<string>>()
      .mockReturnValueOnce(stalePass.promise)
      .mockImplementation(async (frame) => `result:${frame.id}`);
    const { results, runPass: passSpy, scheduler } = schedulerHarness({
      runPass
    });

    scheduler.start("profile-a:session-1");
    await vi.advanceTimersByTimeAsync(1_500);
    scheduler.changeGeneration("profile-b:session-2");
    stalePass.resolve("stale result");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(250);

    expect(passSpy.mock.calls.map(([frame]) => frame.id)).toEqual([
      "profile-a:session-1:frame-1",
      "profile-b:session-2:frame-1"
    ]);
    expect(results).toEqual(["result:profile-b:session-2:frame-1"]);
  });

  it("publishes only a complete pass result atomically", async () => {
    const incompletePass = deferred<string>();
    const { results, scheduler } = schedulerHarness({
      runPass: vi.fn(() => incompletePass.promise)
    });

    scheduler.start("session-1");
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toEqual([]);

    incompletePass.resolve("complete result");
    await Promise.resolve();
    expect(results).toEqual(["complete result"]);
  });

  it("reports pass failures and continues after the required yield", async () => {
    const runPass = vi
      .fn<(frame: CapturedFrame) => Promise<string>>()
      .mockRejectedValueOnce(new Error("engine failed"))
      .mockImplementation(async (frame) => `result:${frame.id}`);
    const { errors, scheduler } = schedulerHarness({ runPass });

    scheduler.start("session-1");
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toEqual([
      expect.objectContaining({ message: "engine failed" })
    ]);

    await vi.advanceTimersByTimeAsync(1_500);
    expect(runPass).toHaveBeenCalledTimes(2);
  });
});
