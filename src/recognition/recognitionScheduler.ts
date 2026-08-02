import type { RecognitionPassIdentity } from "./ocrRecognizer";

export type RecognitionSchedulerState =
  | "searching"
  | "stabilizing"
  | "focused";

export interface RecognitionPassRequest {
  readonly generation: string;
  readonly kind: RecognitionPassIdentity["kind"];
  readonly frameIdentity: string;
  readonly capturedAtMs: number;
}

export interface RecognitionScheduler {
  start(generation: string): void;
  setState(state: RecognitionSchedulerState): void;
  changeGeneration(generation: string): void;
  dispose(): void;
}

const MINIMUM_YIELD_MS = 250;

const CADENCE_MS: Record<
  RecognitionSchedulerState,
  Record<RecognitionPassRequest["kind"], number>
> = {
  searching: { guide: 1_500, discovery: 4_000 },
  stabilizing: { guide: 1_500, discovery: 4_000 },
  focused: { guide: 2_000, discovery: 5_000 }
};

interface ScheduledPass<Input> {
  input: Input;
  request: RecognitionPassRequest;
}

export function createRecognitionScheduler<Input, Output>({
  capturePass,
  runPass,
  onResult,
  onError = () => undefined,
  now = () => performance.now()
}: {
  capturePass: (request: RecognitionPassRequest) => Input | null;
  runPass: (input: Input, request: RecognitionPassRequest) => Promise<Output>;
  onResult: (output: Output, request: RecognitionPassRequest) => void;
  onError?: (error: unknown, request: RecognitionPassRequest) => void;
  now?: () => number;
}): RecognitionScheduler {
  let state: RecognitionSchedulerState = "searching";
  let generation: string | null = null;
  let frameNumber = 0;
  let processing = false;
  let pending: ScheduledPass<Input> | null = null;
  const deferredKinds = new Set<RecognitionPassRequest["kind"]>();
  let disposed = false;
  let cadenceTimer: ReturnType<typeof setTimeout> | undefined;
  let yieldTimer: ReturnType<typeof setTimeout> | undefined;
  let yieldUntil = Number.NEGATIVE_INFINITY;
  let lastCapture: Record<RecognitionPassRequest["kind"], number> = {
    guide: Number.NEGATIVE_INFINITY,
    discovery: Number.NEGATIVE_INFINITY
  };

  const clearCadenceTimer = () => {
    if (cadenceTimer !== undefined) {
      clearTimeout(cadenceTimer);
      cadenceTimer = undefined;
    }
  };

  const clearYieldTimer = () => {
    if (yieldTimer !== undefined) {
      clearTimeout(yieldTimer);
      yieldTimer = undefined;
    }
  };

  const drain = () => {
    if (disposed || processing || !pending) {
      return;
    }
    const remainingYieldMs = yieldUntil - now();
    if (remainingYieldMs > 0) {
      clearYieldTimer();
      yieldTimer = setTimeout(drain, remainingYieldMs);
      return;
    }

    clearYieldTimer();
    const pass = pending;
    pending = null;
    processing = true;
    const deferredKind = deferredKinds.has("discovery")
      ? "discovery"
      : deferredKinds.has("guide")
        ? "guide"
        : null;
    if (deferredKind) {
      deferredKinds.delete(deferredKind);
      capture(deferredKind);
    }

    let passPromise: Promise<Output>;
    try {
      passPromise = runPass(pass.input, pass.request);
    } catch (error) {
      passPromise = Promise.reject(error);
    }
    void passPromise
      .then((output) => {
        if (!disposed && pass.request.generation === generation) {
          onResult(output, pass.request);
        }
      })
      .catch((error: unknown) => {
        if (!disposed && pass.request.generation === generation) {
          onError(error, pass.request);
        }
      })
      .finally(() => {
        processing = false;
        yieldUntil = now() + MINIMUM_YIELD_MS;
        drain();
      });
  };

  function capture(requestedKind: RecognitionPassRequest["kind"]) {
    if (disposed || generation === null) {
      return;
    }
    const capturedAtMs = now();
    const kind =
      pending && pending.request.kind !== requestedKind
        ? pending.request.kind
        : requestedKind;
    if (kind !== requestedKind) {
      deferredKinds.add(requestedKind);
    }
    frameNumber += 1;
    const request: RecognitionPassRequest = {
      generation,
      kind,
      frameIdentity: `${generation}:frame-${frameNumber}`,
      capturedAtMs
    };
    lastCapture[requestedKind] = capturedAtMs;
    lastCapture[kind] = capturedAtMs;
    try {
      const input = capturePass(request);
      if (input !== null) {
        pending = { input, request };
        drain();
      }
    } catch (error) {
      onError(error, request);
    }
  }

  const scheduleNextCapture = () => {
    clearCadenceTimer();
    if (disposed || generation === null) {
      return;
    }
    const cadence = CADENCE_MS[state];
    const guideDueAt = lastCapture.guide + cadence.guide;
    const discoveryDueAt = lastCapture.discovery + cadence.discovery;
    const nextKind =
      discoveryDueAt <= guideDueAt ? "discovery" : "guide";
    const dueAt = Math.min(guideDueAt, discoveryDueAt);
    cadenceTimer = setTimeout(() => {
      capture(nextKind);
      scheduleNextCapture();
    }, Math.max(0, dueAt - now()));
  };

  const beginGeneration = (nextGeneration: string) => {
    generation = nextGeneration;
    frameNumber = 0;
    pending = null;
    deferredKinds.clear();
    const startedAt = now();
    lastCapture = {
      guide: Number.NEGATIVE_INFINITY,
      discovery: startedAt
    };
    capture("guide");
    scheduleNextCapture();
  };

  return {
    start(nextGeneration) {
      if (disposed) {
        return;
      }
      beginGeneration(nextGeneration);
    },

    setState(nextState) {
      if (state === nextState || disposed) {
        return;
      }
      state = nextState;
      scheduleNextCapture();
    },

    changeGeneration(nextGeneration) {
      if (disposed || generation === nextGeneration) {
        return;
      }
      beginGeneration(nextGeneration);
    },

    dispose() {
      disposed = true;
      generation = null;
      pending = null;
      deferredKinds.clear();
      clearCadenceTimer();
      clearYieldTimer();
    }
  };
}
