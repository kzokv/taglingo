import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import type { GuestReferenceRate } from "./fx/referenceRate";
import type { JpyOcrRecognizer } from "./recognition/jpyOcrRecognizer";

const DEFAULT_RATE: GuestReferenceRate = {
  source: "JPY",
  target: "USD",
  direction: "source-to-target",
  value: "0.0067123",
  provider: "Frankfurter",
  method: "daily-blend",
  providerPublishedDate: "2026-07-30",
  fetchedAt: "2026-07-30T10:00:00.000Z",
  state: "fresh",
  attribution: "Frankfurter · ECB, BOJ"
};

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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(DEFAULT_RATE));
});

describe("Guest camera journey", () => {
  it("restores an offline conversion with its cached effective-date state", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    vi.setSystemTime(new Date("2026-08-06T12:00:00.000Z"));
    window.localStorage.setItem(
      "taglingo.rate-snapshot.v1",
      JSON.stringify({
        version: 1,
        records: {
          "JPY/USD": {
            ...DEFAULT_RATE,
            providerPublishedDate: "2026-07-30"
          }
        }
      })
    );
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));

    render(<App />);
    await user.click(screen.getByRole("button", { name: /try without camera/i }));

    expect(await screen.findByText("USD 27.80")).toBeInTheDocument();
    expect(
      screen.getByText(/offline · rate snapshot/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/effective 2026-07-30/i)).toBeInTheDocument();
  });

  it("stops an expired conversion with a reconnect action while recognition continues", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    vi.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));
    window.localStorage.setItem(
      "taglingo.rate-snapshot.v1",
      JSON.stringify({
        version: 1,
        records: {
          "JPY/USD": DEFAULT_RATE
        }
      })
    );
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));

    render(<App />);
    await user.click(screen.getByRole("button", { name: /try without camera/i }));

    expect(
      await screen.findByText(/focused price · jpy 4,142/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("USD 27.80")).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /rate snapshot expired/i
    );
    expect(
      screen.getByRole("button", { name: /reconnect and retry/i })
    ).toBeInTheDocument();
  });

  it("converts the Focused Price with one dated Reference Rate without refreshing for recognition observations", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const loadGuestRate = vi.fn().mockResolvedValue(DEFAULT_RATE);

    render(<App loadGuestRate={loadGuestRate} />);
    await waitFor(() =>
      expect(loadGuestRate).toHaveBeenCalledWith("JPY", "USD", expect.anything())
    );
    await user.click(screen.getByRole("button", { name: /try without camera/i }));

    expect(
      await screen.findByText(/focused price · jpy 4,142/i)
    ).toBeInTheDocument();
    expect(screen.getByText("USD 27.80")).toBeInTheDocument();
    expect(screen.getByText("1 JPY = 0.0067123 USD")).toBeInTheDocument();
    expect(screen.getByText(/effective 2026-07-30/i)).toBeInTheDocument();
    expect(screen.getByText("Frankfurter · ECB, BOJ")).toBeInTheDocument();
    expect(
      screen.getByText("Reference estimate; your payment rate may differ.")
    ).toBeInTheDocument();
    expect(loadGuestRate).toHaveBeenCalledOnce();
  });

  it("refreshes the selected Reference Rate when the application resumes", async () => {
    useMediaDevices(vi.fn());
    const loadGuestRate = vi.fn().mockResolvedValue(DEFAULT_RATE);
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");

    render(<App loadGuestRate={loadGuestRate} />);
    await waitFor(() => expect(loadGuestRate).toHaveBeenCalledOnce());
    fireEvent(document, new Event("visibilitychange"));
    expect(loadGuestRate).toHaveBeenCalledOnce();

    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(loadGuestRate).toHaveBeenCalledTimes(2));
  });

  it("explains privacy before opening the rear camera without camera-driven network traffic", async () => {
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
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/fx?source=JPY&target=USD",
      expect.objectContaining({
        credentials: "same-origin",
        signal: expect.any(AbortSignal)
      })
    );

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

  it("turns the recorded Japanese observation into an accessible stable Focused Price", async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn();
    useMediaDevices(getUserMedia);

    render(<App />);
    await user.click(screen.getByRole("button", { name: /try without camera/i }));

    expect(screen.getByText("4,142円")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAccessibleName(
      /preparing japanese recognition/i
    );
    expect(
      await screen.findByText(/focused price · jpy 4,142/i)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/detected price jpy 4,142/i)
    ).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("stabilizes browser-local camera observations without uploading them", async () => {
    const user = userEvent.setup();
    const { stream } = createMediaStream();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    const recognize = vi
      .fn()
      .mockImplementation(
        async (_image: unknown, pass: "focused" | "discovery" = "focused") => [
          {
            text: "4,142円",
            confidence: 96,
            box:
              pass === "discovery"
                ? { x: 880, y: 446, width: 160, height: 80 }
                : { x: 592, y: 111, width: 160, height: 80 }
          }
        ]
      );
    const recognizer: JpyOcrRecognizer = {
      prepare: vi.fn().mockResolvedValue(undefined),
      recognize,
      terminate: vi.fn().mockResolvedValue(undefined)
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    let reportProgress: (progress: number, status: string) => void =
      () => undefined;

    render(
      <App
        createRecognizer={(onProgress) => {
          reportProgress = onProgress;
          return recognizer;
        }}
      />
    );
    await user.click(screen.getByRole("button", { name: /open camera/i }));
    const video = await screen.findByLabelText(/rear camera preview/i);
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1920 },
      videoHeight: { configurable: true, value: 1080 }
    });
    vi.spyOn(video.parentElement!, "getBoundingClientRect").mockReturnValue({
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
    fireEvent.loadedMetadata(video);

    expect(
      await screen.findByText(/focused price · jpy 4,142/i, {}, { timeout: 1500 })
    ).toBeInTheDocument();
    const highlightedPrice = screen.getByLabelText(/detected price jpy 4,142/i);
    expect(highlightedPrice).toHaveClass("focused-detection");
    expect(Number.parseFloat(highlightedPrice.style.left)).toBeCloseTo(
      132.481,
      3
    );
    expect(Number.parseFloat(highlightedPrice.style.top)).toBeCloseTo(
      348.541,
      3
    );
    expect(recognizer.prepare).toHaveBeenCalledOnce();
    expect(recognize).toHaveBeenCalled();
    await waitFor(
      () => expect(recognize).toHaveBeenCalledTimes(4),
      { timeout: 1800 }
    );
    expect(recognize).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      "discovery"
    );
    recognize.mockResolvedValue([]);
    await waitFor(() => expect(recognize).toHaveBeenCalledTimes(5));
    expect(
      screen.getByLabelText(/detected price jpy 4,142/i)
    ).toHaveClass("focused-detection");
    act(() => reportProgress(0.5, "recognizing text"));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledOnce();
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
