export interface NewestOnlyPipeline<Input> {
  submit(input: Input): void;
  whenIdle(): Promise<void>;
  dispose(): void;
}

export function createNewestOnlyPipeline<Input, Output>({
  recognize,
  onResult,
  onError = () => undefined
}: {
  recognize: (input: Input) => Promise<Output>;
  onResult: (output: Output) => void;
  onError?: (error: unknown) => void;
}): NewestOnlyPipeline<Input> {
  let pending: Input | undefined;
  let processing = false;
  let disposed = false;
  let idleWaiters: Array<() => void> = [];

  const settleIdle = () => {
    if (processing || pending !== undefined) {
      return;
    }
    idleWaiters.forEach((resolve) => resolve());
    idleWaiters = [];
  };

  const drain = async () => {
    if (processing || disposed) {
      return;
    }
    processing = true;

    while (!disposed && pending !== undefined) {
      const input = pending;
      pending = undefined;
      try {
        onResult(await recognize(input));
      } catch (error) {
        onError(error);
      }
    }

    processing = false;
    settleIdle();
  };

  return {
    submit(input) {
      if (disposed) {
        return;
      }
      pending = input;
      void drain();
    },

    whenIdle() {
      if (!processing && pending === undefined) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => idleWaiters.push(resolve));
    },

    dispose() {
      disposed = true;
      pending = undefined;
      settleIdle();
    }
  };
}
