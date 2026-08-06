import type { CreateRecognizer, OcrRecognizer } from "./ocrRecognizer";
import type { RecognitionRuntimeConfiguration } from "./recognitionRuntime";

export type RecognitionPreparationSnapshot =
  | { readonly phase: "idle"; readonly progress: 0 }
  | { readonly phase: "preparing"; readonly progress: number }
  | { readonly phase: "ready"; readonly progress: 1 }
  | { readonly phase: "error"; readonly progress: number };

export interface RecognitionPreparation {
  prepare(): Promise<OcrRecognizer>;
  retry(): Promise<OcrRecognizer>;
  run<T>(operation: (recognizer: OcrRecognizer) => Promise<T>): Promise<T>;
  getSnapshot(): RecognitionPreparationSnapshot;
  subscribe(
    listener: (snapshot: RecognitionPreparationSnapshot) => void
  ): () => void;
  dispose(): void;
}

const DISPOSED_MESSAGE = "Recognition preparation was disposed.";

export function createRecognitionPreparation({
  runtime,
  createRecognizer
}: {
  runtime: RecognitionRuntimeConfiguration;
  createRecognizer: CreateRecognizer;
}): RecognitionPreparation {
  let snapshot: RecognitionPreparationSnapshot = {
    phase: "idle",
    progress: 0
  };
  let recognizer: OcrRecognizer | null = null;
  let inFlightRecognizerAcquisition: Promise<OcrRecognizer> | null = null;
  let preparationError: unknown = null;
  let executionTail: Promise<unknown> = Promise.resolve();
  let disposed = false;
  const listeners = new Set<
    (snapshot: RecognitionPreparationSnapshot) => void
  >();

  const publish = (next: RecognitionPreparationSnapshot) => {
    if (disposed) return;
    snapshot = next;
    listeners.forEach((listener) => listener(snapshot));
  };

  const acquireRecognizer = () => {
    if (disposed) {
      return Promise.reject(new Error(DISPOSED_MESSAGE));
    }
    if (inFlightRecognizerAcquisition) return inFlightRecognizerAcquisition;
    if (snapshot.phase === "error" && preparationError !== null) {
      return Promise.reject(preparationError);
    }
    if (recognizer && snapshot.phase === "ready") {
      return Promise.resolve(recognizer);
    }

    publish({ phase: "preparing", progress: 0 });
    let nextRecognizer: OcrRecognizer;
    try {
      nextRecognizer = createRecognizer(runtime, (progress) => {
        if (snapshot.phase !== "preparing") return;
        publish({
          phase: "preparing",
          progress: Math.max(
            snapshot.progress,
            Math.min(1, Math.max(0, progress))
          )
        });
      });
    } catch (error) {
      preparationError = error;
      publish({ phase: "error", progress: snapshot.progress });
      return Promise.reject(error);
    }
    recognizer = nextRecognizer;
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      await nextRecognizer.terminate().catch(() => undefined);
    };
    let prepareResult: Promise<void>;
    try {
      prepareResult = nextRecognizer.prepare();
    } catch (error) {
      prepareResult = Promise.reject(error);
    }
    const current = prepareResult
      .then(async () => {
        if (disposed) {
          await release();
          if (recognizer === nextRecognizer) recognizer = null;
          throw new Error(DISPOSED_MESSAGE);
        }
        publish({ phase: "ready", progress: 1 });
        return nextRecognizer;
      })
      .catch(async (error: unknown) => {
        if (recognizer === nextRecognizer) recognizer = null;
        await release();
        if (!disposed) {
          preparationError = error;
          const progress = snapshot.progress;
          publish({ phase: "error", progress });
        }
        throw error;
      })
      .finally(() => {
        if (
          inFlightRecognizerAcquisition === current &&
          snapshot.phase !== "ready"
        ) {
          inFlightRecognizerAcquisition = null;
        }
      });
    inFlightRecognizerAcquisition = current;
    return current;
  };

  return {
    prepare: acquireRecognizer,

    async retry() {
      if (snapshot.phase === "preparing") return acquireRecognizer();
      preparationError = null;
      if (recognizer) {
        const previous = recognizer;
        recognizer = null;
        publish({ phase: "preparing", progress: 0 });
        let transition: Promise<OcrRecognizer>;
        transition = executionTail
          .catch(() => undefined)
          .then(() => previous.terminate().catch(() => undefined))
          .then(() => {
            if (disposed) throw new Error(DISPOSED_MESSAGE);
            if (inFlightRecognizerAcquisition === transition) {
              inFlightRecognizerAcquisition = null;
            }
            return acquireRecognizer();
          });
        inFlightRecognizerAcquisition = transition;
        return transition;
      }
      return acquireRecognizer();
    },

    run<T>(operation: (recognizer: OcrRecognizer) => Promise<T>) {
      if (disposed) return Promise.reject(new Error(DISPOSED_MESSAGE));
      const execution = executionTail
        .catch(() => undefined)
        .then(async () => {
          if (disposed) throw new Error(DISPOSED_MESSAGE);
          return operation(await acquireRecognizer());
        });
      executionTail = execution;
      return execution;
    },

    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      if (snapshot.phase === "ready" && recognizer) {
        const preparedRecognizer = recognizer;
        recognizer = null;
        inFlightRecognizerAcquisition = null;
        void executionTail.finally(() => preparedRecognizer.terminate()).catch(
          () => undefined
        );
      }
    }
  };
}
