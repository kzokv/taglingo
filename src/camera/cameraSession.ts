export type CameraStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unavailable"
  | "interrupted"
  | "error";

export interface CameraSnapshot {
  status: CameraStatus;
  stream: MediaStream | null;
}

export interface CameraSession {
  start(): Promise<CameraSnapshot>;
  stop(): void;
  interrupt(): void;
  getSnapshot(): CameraSnapshot;
  subscribe(listener: (snapshot: CameraSnapshot) => void): () => void;
  dispose(): void;
}

interface CameraSessionDependencies {
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  document: Pick<
    Document,
    "addEventListener" | "removeEventListener" | "visibilityState"
  >;
}

const REAR_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: { ideal: "environment" } }
};

export function createCameraSession({
  mediaDevices,
  document
}: CameraSessionDependencies): CameraSession {
  let snapshot: CameraSnapshot = { status: "idle", stream: null };
  let requestVersion = 0;
  let removeTrackListeners: (() => void) | undefined;
  const listeners = new Set<(value: CameraSnapshot) => void>();

  const publish = (nextSnapshot: CameraSnapshot) => {
    snapshot = nextSnapshot;
    listeners.forEach((listener) => listener(snapshot));
  };

  const stopStream = (stream: MediaStream | null) => {
    removeTrackListeners?.();
    removeTrackListeners = undefined;
    stream?.getTracks().forEach((track) => track.stop());
  };

  const stop = () => {
    requestVersion += 1;
    stopStream(snapshot.stream);
    publish({ status: "idle", stream: null });
  };

  const interrupt = () => {
    requestVersion += 1;
    stopStream(snapshot.stream);
    publish({ status: "interrupted", stream: null });
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      stop();
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  return {
    async start() {
      if (snapshot.status === "active") {
        return snapshot;
      }

      if (!mediaDevices?.getUserMedia) {
        publish({ status: "unavailable", stream: null });
        return snapshot;
      }

      const currentRequest = ++requestVersion;
      publish({ status: "requesting", stream: null });

      try {
        const stream = await mediaDevices.getUserMedia(REAR_CAMERA_CONSTRAINTS);

        if (currentRequest !== requestVersion) {
          stream.getTracks().forEach((track) => track.stop());
          return snapshot;
        }

        if (document.visibilityState === "hidden") {
          stream.getTracks().forEach((track) => track.stop());
          publish({ status: "idle", stream: null });
          return snapshot;
        }

        const handleTrackEnded = () => {
          if (snapshot.stream === stream) {
            stopStream(stream);
            publish({ status: "interrupted", stream: null });
          }
        };
        stream
          .getTracks()
          .forEach((track) =>
            track.addEventListener("ended", handleTrackEnded, { once: true })
          );
        removeTrackListeners = () =>
          stream
            .getTracks()
            .forEach((track) =>
              track.removeEventListener("ended", handleTrackEnded)
            );

        publish({ status: "active", stream });
      } catch (error) {
        if (currentRequest !== requestVersion) {
          return snapshot;
        }

        const status: CameraStatus =
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "denied"
            : error instanceof DOMException &&
                (error.name === "NotFoundError" ||
                  error.name === "OverconstrainedError")
              ? "unavailable"
              : "error";
        publish({ status, stream: null });
      }

      return snapshot;
    },

    stop,
    interrupt,

    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stop();
      listeners.clear();
    }
  };
}

export function isCameraFailureStatus(status: CameraStatus): boolean {
  return ["denied", "unavailable", "interrupted", "error"].includes(status);
}
