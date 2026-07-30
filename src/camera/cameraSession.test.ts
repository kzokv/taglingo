import { describe, expect, it, vi } from "vitest";

import { createCameraSession } from "./cameraSession";

function createTrack() {
  const listeners = new Map<string, EventListener>();
  return {
    kind: "video",
    readyState: "live",
    stop: vi.fn(),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, listener);
    }),
    removeEventListener: vi.fn(),
    end: () => listeners.get("ended")?.(new Event("ended"))
  } as unknown as MediaStreamTrack & { end(): void };
}

function createStream(track: MediaStreamTrack) {
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track]
  } as unknown as MediaStream;
}

describe("Camera Session", () => {
  it("starts with a rear-camera preference and no audio", async () => {
    const track = createTrack();
    const stream = createStream(track);
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const session = createCameraSession({
      mediaDevices: { getUserMedia } as unknown as MediaDevices,
      document: window.document
    });

    await session.start();

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { ideal: "environment" } }
    });
    expect(session.getSnapshot()).toMatchObject({
      status: "active",
      stream
    });
    session.dispose();
  });

  it("stops every camera track when the page becomes hidden", async () => {
    const track = createTrack();
    const session = createCameraSession({
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(createStream(track))
      } as unknown as MediaDevices,
      document: window.document
    });
    await session.start();

    Object.defineProperty(window.document, "visibilityState", {
      configurable: true,
      value: "hidden"
    });
    window.document.dispatchEvent(new Event("visibilitychange"));

    expect(track.stop).toHaveBeenCalledOnce();
    expect(session.getSnapshot().status).toBe("idle");
    Object.defineProperty(window.document, "visibilityState", {
      configurable: true,
      value: "visible"
    });
    session.dispose();
  });

  it("reports denial and permits a later retry", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"))
      .mockResolvedValueOnce(createStream(createTrack()));
    const session = createCameraSession({
      mediaDevices: { getUserMedia } as unknown as MediaDevices,
      document: window.document
    });

    await session.start();
    expect(session.getSnapshot().status).toBe("denied");

    await session.start();
    expect(session.getSnapshot().status).toBe("active");
    session.dispose();
  });

  it("reports an interrupted track and permits a later retry", async () => {
    const interruptedTrack = createTrack();
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(createStream(interruptedTrack))
      .mockResolvedValueOnce(createStream(createTrack()));
    const session = createCameraSession({
      mediaDevices: { getUserMedia } as unknown as MediaDevices,
      document: window.document
    });

    await session.start();
    interruptedTrack.end();
    expect(session.getSnapshot().status).toBe("interrupted");

    await session.start();
    expect(session.getSnapshot().status).toBe("active");
    session.dispose();
  });

  it("stops the stream when preview playback is interrupted", async () => {
    const track = createTrack();
    const session = createCameraSession({
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(createStream(track))
      } as unknown as MediaDevices,
      document: window.document
    });
    await session.start();

    session.interrupt();

    expect(track.stop).toHaveBeenCalledOnce();
    expect(session.getSnapshot().status).toBe("interrupted");
    session.dispose();
  });
});
