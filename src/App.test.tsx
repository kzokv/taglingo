import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";

function createMediaStream() {
  const track = {
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  } as unknown as MediaStreamTrack;
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track]
  } as unknown as MediaStream;
  return { stream, track };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function useMediaDevices(getUserMedia: ReturnType<typeof vi.fn>) {
  Object.defineProperty(window.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia }
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Guest camera journey", () => {
  it("explains privacy before opening the rear camera without network traffic", async () => {
    const user = userEvent.setup();
    const { stream, track } = createMediaStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    useMediaDevices(getUserMedia);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<App />);

    expect(
      screen.getByRole("heading", { name: /point at a price/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/camera frames stay on this device/i)
    ).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /open camera/i }));

    expect(
      await screen.findByText(/^camera ready$/i)
    ).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { ideal: "environment" } }
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /close camera/i }));
    expect(track.stop).toHaveBeenCalled();
  });

  it("offers an actionable retry after camera permission is denied", async () => {
    const user = userEvent.setup();
    const { stream } = createMediaStream();
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"))
      .mockResolvedValueOnce(stream);
    useMediaDevices(getUserMedia);

    render(<App />);
    await user.click(screen.getByRole("button", { name: /open camera/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /camera access was denied/i
    );

    await user.click(screen.getByRole("button", { name: /try camera again/i }));
    expect(
      await screen.findByText(/^camera ready$/i)
    ).toBeInTheDocument();
  });

  it("offers a retry when the browser cannot play the camera preview", async () => {
    const user = userEvent.setup();
    const { stream, track } = createMediaStream();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(
      new DOMException("Playback failed", "AbortError")
    );

    render(<App />);
    await user.click(screen.getByRole("button", { name: /open camera/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /camera was interrupted/i
    );
    expect(track.stop).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /try camera again/i })
    ).toBeInTheDocument();
  });

  it("ignores playback failures from a detached camera preview", async () => {
    const user = userEvent.setup();
    const firstPlayback = createDeferred<void>();
    const firstCamera = createMediaStream();
    const secondCamera = createMediaStream();
    useMediaDevices(
      vi
        .fn()
        .mockResolvedValueOnce(firstCamera.stream)
        .mockResolvedValueOnce(secondCamera.stream)
    );
    vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockReturnValueOnce(firstPlayback.promise)
      .mockResolvedValueOnce();

    render(<App />);
    await user.click(screen.getByRole("button", { name: /open camera/i }));
    await screen.findByText(/^camera ready$/i);
    await user.click(screen.getByRole("button", { name: /close camera/i }));
    await user.click(screen.getByRole("button", { name: /open camera/i }));
    await screen.findByText(/^camera ready$/i);

    await act(async () => {
      firstPlayback.reject(new DOMException("Detached", "AbortError"));
    });

    expect(secondCamera.track.stop).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/^camera ready$/i)).toBeInTheDocument();
  });

  it("opens a deterministic no-camera demonstration", async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn();
    useMediaDevices(getUserMedia);

    render(<App />);
    await user.click(screen.getByRole("button", { name: /try without camera/i }));

    expect(screen.getByText("4,142円")).toBeInTheDocument();
    expect(screen.getByText(/demo mode · no camera requested/i)).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("searches one Target Currency and restores Guest preferences after reload", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const firstVisit = render(<App />);

    expect(
      within(
        screen.getByRole("combobox", { name: /source currency/i })
      ).getAllByRole("option")
    ).toHaveLength(12);

    await user.selectOptions(
      screen.getByRole("combobox", { name: /source currency/i }),
      "EUR"
    );
    await user.type(
      screen.getByRole("searchbox", { name: /find target currency/i }),
      "台幣"
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /^target currency/i }),
      "TWD"
    );

    firstVisit.unmount();
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: /source currency/i })
      ).toHaveValue("EUR");
      expect(
        screen.getByRole("combobox", { name: /^target currency/i })
      ).toHaveValue("TWD");
    });
  });

  it("remains usable when browser storage access is blocked", () => {
    useMediaDevices(vi.fn());
    const localStorageGetter = vi
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError");
      });

    render(<App />);

    expect(
      screen.getByRole("heading", { name: /point at a price/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /source currency/i })
    ).toHaveValue("JPY");
    localStorageGetter.mockRestore();
  });
});
