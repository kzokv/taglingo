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

// Existing deterministic camera tests exercise the legacy JPY adapter without
// making a production Camera-supported claim. The real catalog remains fully
// manual-only until physical qualification is recorded.
vi.mock("./domain/currencyCapabilities", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./domain/currencyCapabilities")>();
  return {
    ...actual,
    getCurrencyCapability: (
      sourceCurrency: CurrencyCode,
      platform: Parameters<typeof actual.getCurrencyCapability>[1]
    ) => ({
      ...actual.getCurrencyCapability(sourceCurrency, platform),
      cameraSupported: sourceCurrency === "JPY"
    })
  };
});

vi.mock("./recognition/recognitionProfile", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./recognition/recognitionProfile")>();
  const { createTestRecognitionProfile } = await import(
    "./test/recognitionProfile"
  );
  const testProfile = createTestRecognitionProfile({
    id: "desktop-test-jpy"
  });
  return {
    ...actual,
    resolveQualifiedRecognitionProfile: (sourceCurrency: CurrencyCode) =>
      sourceCurrency === "JPY" ? testProfile : null
  };
});

import App from "./App";
import type { CurrencyCode } from "./domain/currencies";
import type { GuestReferenceRate } from "./fx/referenceRate";
import type { MemberPreferences } from "./member/memberPreferencesApi";
import { MemberPreferencesRequestError } from "./member/memberPreferencesClient";
import { createTestRecognitionProfile } from "./test/recognitionProfile";
import type {
  OcrRecognizer,
  RecognitionPassIdentity
} from "./recognition/ocrRecognizer";

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

const getTestMemberSessionToken = async () => "session-token";
const getElementBounds = HTMLElement.prototype.getBoundingClientRect;

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
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.classList.contains("capture-guide")) {
        return {
          width: 280,
          height: 132,
          x: 55,
          y: 313.8,
          top: 313.8,
          right: 335,
          bottom: 445.8,
          left: 55,
          toJSON: () => ({})
        };
      }
      return getElementBounds.call(this);
    }
  );
});

describe("Manual Price Entry journey", () => {
  it("promotes the camera-sheet composer after five seconds without moving focus", async () => {
    vi.useFakeTimers();
    useMediaDevices(
      vi
        .fn()
        .mockRejectedValue(new DOMException("Denied", "NotAllowedError"))
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open camera/i }));

    const composer = screen.getByRole("region", {
      name: /manual price entry/i
    });
    expect(
      within(composer).getByRole("button", {
        name: /open manual price entry/i
      })
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      within(composer).queryByRole("textbox", { name: /jpy amount/i })
    ).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(4_999);
    });
    expect(
      within(composer).queryByRole("textbox", { name: /jpy amount/i })
    ).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    const amountInput = within(composer).getByRole("textbox", {
      name: /jpy amount/i
    });
    expect(amountInput).toBeInTheDocument();
    expect(amountInput).not.toHaveFocus();

    fireEvent.click(
      within(composer).getByRole("button", {
        name: /close manual price entry/i
      })
    );
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(
      within(composer).getByRole("button", {
        name: /open manual price entry/i
      })
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the Entered Price in use until the shopper explicitly switches", async () => {
    vi.useFakeTimers();
    useMediaDevices(vi.fn());

    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(
      screen.getByRole("button", { name: /try without camera/i })
    );

    const composer = screen.getByRole("region", {
      name: /manual price entry/i
    });
    expect(
      within(composer).getByRole("button", {
        name: /open manual price entry/i
      })
    ).toBeInTheDocument();
    fireEvent.click(
      within(composer).getByRole("button", {
        name: /open manual price entry/i
      })
    );
    fireEvent.change(
      within(composer).getByRole("textbox", { name: /jpy amount/i }),
      { target: { value: "5,000" } }
    );
    fireEvent.click(
      within(composer).getByRole("button", {
        name: /convert entered price/i
      })
    );

    expect(
      screen.getByRole("status", { name: /price used for conversion/i })
    ).toHaveTextContent(/entered price in use/i);
    expect(screen.getByText("USD 33.56")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(160);
    });
    expect(
      within(
        screen.getByRole("region", { name: /recognition summary/i })
      ).getByText(/focused price · jpy 4,142/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: /price used for conversion/i })
    ).toHaveTextContent(/entered price in use/i);
    expect(screen.getByText("USD 33.56")).toBeInTheDocument();

    fireEvent.change(
      within(composer).getByRole("textbox", { name: /jpy amount/i }),
      { target: { value: "1e3" } }
    );
    fireEvent.click(
      within(composer).getByRole("button", {
        name: /convert entered price/i
      })
    );
    expect(
      within(composer).getByText(/decimal and grouping separators/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: /price used for conversion/i })
    ).toHaveTextContent(/entered price in use/i);
    expect(screen.getByText("USD 33.56")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /use focused price · jpy 4,142/i
      })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /use focused price · jpy 4,142/i
      })
    );
    expect(
      screen.getByRole("status", { name: /price used for conversion/i })
    ).toHaveTextContent(/focused price in use/i);
    expect(screen.getByText("USD 27.80")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /use entered price · jpy 5,000/i
      })
    );
    expect(screen.getByText("USD 33.56")).toBeInTheDocument();

    fireEvent.click(
      within(composer).getByRole("button", { name: /enter another price/i })
    );
    expect(
      screen.getByRole("status", { name: /price used for conversion/i })
    ).toHaveTextContent(/focused price in use/i);
    expect(screen.getByText("USD 27.80")).toBeInTheDocument();
  });

  it("keeps an unqualified camera candidate on Manual Price Entry", async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn();
    const createRecognizer = vi.fn(() => {
      throw new Error("recognition must remain unloaded");
    });
    useMediaDevices(getUserMedia);

    render(
      <App
        createRecognizer={createRecognizer}
        resolveRecognitionProfile={() => null}
      />
    );

    expect(
      screen.getByRole("button", { name: /enter price manually/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /open camera/i })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /enter price manually/i })
    );

    expect(
      screen.getByText(/initial camera qualification candidate/i)
    ).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(createRecognizer).not.toHaveBeenCalled();
  });

  it("opens a manual-only currency without camera work and converts it", async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn();
    const createRecognizer = vi.fn(() => {
      throw new Error("recognition must remain unloaded");
    });
    const loadGuestRate = vi.fn(
      async (source: CurrencyCode, target: CurrencyCode) => ({
        ...DEFAULT_RATE,
        source,
        target,
        value: "2"
      })
    );
    useMediaDevices(getUserMedia);

    render(
      <App
        createRecognizer={createRecognizer}
        loadGuestRate={loadGuestRate}
      />
    );

    const sourcePicker = screen.getByRole("combobox", {
      name: /source currency/i
    });
    expect(within(sourcePicker).getAllByRole("option")).toHaveLength(31);

    await user.selectOptions(sourcePicker, "BRL");

    expect(
      screen.getByRole("heading", { name: /manual price entry/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/camera recognition is unavailable/i)
    ).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(createRecognizer).not.toHaveBeenCalled();

    const amountInput = screen.getByRole("textbox", { name: /brl amount/i });
    expect(amountInput).toHaveAttribute("placeholder", "1.234,56");
    expect(
      screen.getByText("Use 1.234,56 or R$ 1.234,56.")
    ).toBeInTheDocument();

    await user.type(amountInput, "R$ 12,34");
    await user.click(
      screen.getByRole("button", { name: /convert entered price/i })
    );

    const enteredPrice = screen.getByRole("region", {
      name: /entered price/i
    });
    expect(enteredPrice).toHaveTextContent(/entered manually/i);
    expect(enteredPrice).toHaveTextContent("BRL 12,34");
    expect(await screen.findByText("USD 24.68")).toBeInTheDocument();
    expect(window.localStorage.getItem("taglingo.guest-preferences.v1")).toBe(
      JSON.stringify({ sourceCurrency: "BRL", targetCurrency: "USD" })
    );
    expect(
      window.localStorage.getItem("taglingo.guest-preferences.v1")
    ).not.toContain("12,34");
  });
});

describe("Guest camera journey", () => {
  it("keeps the Clerk admission surface alongside the public Guest scanner", () => {
    useMediaDevices(vi.fn());

    render(
      <App
        admission={
          <section aria-label="Member admission">
            <button type="button">Request member access</button>
          </section>
        }
      />
    );

    expect(
      screen.getByRole("button", { name: /open camera/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /member admission/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/guest mode/i)).toBeInTheDocument();
  });

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

  it("explains quota exhaustion and permits a targeted Reference Rate retry", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error: "Guest Reference Rate limit exceeded. Try again shortly." },
        { status: 429 }
      )
    );

    render(<App />);
    await user.click(screen.getByRole("button", { name: /try without camera/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /reference rate request limit reached/i
    );
    await user.click(
      screen.getByRole("button", { name: /try reference rate again/i })
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
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
      screen.getByRole("heading", { name: /understand any price/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/camera frames stay on this device/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /physical-device qualification applies to this camera path/i
      )
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
    vi.useFakeTimers();
    const getUserMedia = vi.fn();
    useMediaDevices(getUserMedia);

    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: /try without camera/i })
    );

    expect(screen.getByText("4,142円")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAccessibleName(
      /preparing jpy recognition/i
    );
    await act(async () => {
      vi.advanceTimersByTime(160);
    });
    expect(
      screen.getByText(/focused price · jpy 4,142/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /recognition summary/i })
    ).toHaveTextContent(/1 Detected Price/i);
    expect(
      document.querySelector(".detected-price")
    ).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.queryByRole("img", { name: /detected price/i })
    ).not.toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("returns keyboard focus to Target Currency settings after dismissing the picker", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());

    render(<App />);
    const trigger = screen.getByRole("button", {
      name: /target currencies: 1 selected · usd/i
    });
    await user.click(trigger);
    expect(
      screen.getByRole("searchbox", { name: /search target currencies/i })
    ).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("searchbox", { name: /search target currencies/i })
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps Manual Price Entry usable while recognition initializes", async () => {
    const user = userEvent.setup();
    const { stream } = createMediaStream();
    const preparation = createDeferred<void>();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    const recognizer: OcrRecognizer = {
      prepare: vi.fn().mockReturnValue(preparation.promise),
      recognize: vi.fn().mockResolvedValue([]),
      terminate: vi.fn().mockResolvedValue(undefined)
    };

    render(<App createRecognizer={() => recognizer} />);
    await user.click(screen.getByRole("button", { name: /open camera/i }));
    const video = await screen.findByLabelText(/rear camera preview/i);
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1920 },
      videoHeight: { configurable: true, value: 1080 }
    });
    fireEvent.loadedMetadata(video);

    expect(
      await screen.findByRole("progressbar", {
        name: /preparing jpy recognition/i
      })
    ).toBeInTheDocument();
    const composer = screen.getByRole("region", {
      name: /manual price entry/i
    });
    await user.click(
      within(composer).getByRole("button", {
        name: /open manual price entry/i
      })
    );
    await user.type(
      within(composer).getByRole("textbox", { name: /jpy amount/i }),
      "5,000"
    );
    await user.click(
      within(composer).getByRole("button", {
        name: /convert entered price/i
      })
    );

    expect(
      screen.getByRole("status", { name: /price used for conversion/i })
    ).toHaveTextContent(/entered price in use/i);
    await act(async () => preparation.resolve());
  });

  it("offers deterministic recovery when local recognition preparation fails", async () => {
    const user = userEvent.setup();
    const { stream } = createMediaStream();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    const failedRecognizer: OcrRecognizer = {
      prepare: vi.fn().mockRejectedValue(new Error("model unavailable")),
      recognize: vi.fn(),
      terminate: vi.fn().mockResolvedValue(undefined)
    };
    const recoveredRecognizer: OcrRecognizer = {
      prepare: vi.fn().mockResolvedValue(undefined),
      recognize: vi.fn().mockResolvedValue([]),
      terminate: vi.fn().mockResolvedValue(undefined)
    };
    const createRecognizer = vi
      .fn()
      .mockReturnValueOnce(failedRecognizer)
      .mockReturnValueOnce(recoveredRecognizer);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D);

    render(<App createRecognizer={createRecognizer} />);
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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /recognition could not start/i
    );
    expect(
      await screen.findByRole("textbox", { name: /jpy amount/i })
    ).toBeInTheDocument();
    expect(createRecognizer).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: /use no-camera demo/i })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /try recognition again/i })
    );

    expect(await screen.findByText(/no Detected Price yet/i)).toBeInTheDocument();
    expect(createRecognizer).toHaveBeenCalledTimes(2);
  });

  it("moves an active camera session to Manual Price Entry when its profile is demoted", async () => {
    const user = userEvent.setup();
    const { stream, track } = createMediaStream();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    const recognizer: OcrRecognizer = {
      prepare: vi.fn().mockResolvedValue(undefined),
      recognize: vi.fn().mockResolvedValue([]),
      terminate: vi.fn().mockResolvedValue(undefined)
    };
    const profile = createTestRecognitionProfile({
      id: "demotion-test-jpy"
    });
    let qualified = true;
    const resolveRecognitionProfile = () =>
      qualified ? profile : null;
    const app = () => (
      <App
        createRecognizer={() => recognizer}
        resolveRecognitionProfile={resolveRecognitionProfile}
      />
    );
    const view = render(app());

    await user.click(screen.getByRole("button", { name: /open camera/i }));
    const video = await screen.findByLabelText(/rear camera preview/i);
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1920 },
      videoHeight: { configurable: true, value: 1080 }
    });
    fireEvent.loadedMetadata(video);
    await waitFor(() => expect(recognizer.prepare).toHaveBeenCalledOnce());

    qualified = false;
    view.rerender(app());

    expect(
      await screen.findByRole("textbox", { name: /jpy amount/i })
    ).toBeInTheDocument();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(recognizer.terminate).toHaveBeenCalledOnce();
  });

  it("stops an idle active camera session when its profile evidence expires", async () => {
    const { stream, track } = createMediaStream();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    const recognizer: OcrRecognizer = {
      prepare: vi.fn().mockResolvedValue(undefined),
      recognize: vi.fn().mockResolvedValue([]),
      terminate: vi.fn().mockResolvedValue(undefined)
    };
    const expiresAt = "2027-01-01T00:00:00.000Z";
    const profile = createTestRecognitionProfile({
      id: "expiry-test-jpy",
      expiresAt
    });
    let expired = false;
    let expireProfile!: () => void;
    const resolveRecognitionProfile = () => (expired ? null : profile);
    const scheduleProfileExpiry = vi.fn(
      (_expiresAt: string, onExpire: () => void) => {
        expireProfile = onExpire;
        return vi.fn();
      }
    );

    render(
      <App
        createRecognizer={() => recognizer}
        resolveRecognitionProfile={resolveRecognitionProfile}
        scheduleProfileExpiry={scheduleProfileExpiry}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /open camera/i }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByLabelText(/rear camera preview/i)).toBeInTheDocument();
    expect(scheduleProfileExpiry).toHaveBeenCalledWith(
      expiresAt,
      expect.any(Function)
    );

    expired = true;
    act(() => expireProfile());

    expect(
      screen.getByRole("textbox", { name: /jpy amount/i })
    ).toBeInTheDocument();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("stabilizes browser-local camera observations without uploading them", async () => {
    const user = userEvent.setup();
    const { stream } = createMediaStream();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    const recognize = vi
      .fn()
      .mockImplementation(
        async (_image: unknown, pass: RecognitionPassIdentity) => [
          {
            text: "4,142円",
            confidence: 96,
            box:
              pass.kind === "discovery"
                ? { x: 170, y: 446, width: 160, height: 80 }
                : { x: 64, y: 40, width: 160, height: 80 }
          }
        ]
      );
    const recognizer: OcrRecognizer = {
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
        createRecognizer={(_sourceCurrency, onProgress) => {
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
      await screen.findByText(/focused price · jpy 4,142/i, {}, { timeout: 2500 })
    ).toBeInTheDocument();
    const highlightedPrice = document.querySelector(
      '[data-detected-price="JPY-4142"]'
    ) as HTMLElement;
    expect(highlightedPrice).toHaveClass("focused-detection");
    expect(Number.parseFloat(highlightedPrice.style.left)).toBeCloseTo(
      104.348,
      3
    );
    expect(Number.parseFloat(highlightedPrice.style.top)).toBeCloseTo(
      344.633,
      3
    );
    expect(recognizer.prepare).toHaveBeenCalledOnce();
    expect(recognize).toHaveBeenCalled();
    await waitFor(
      () => expect(recognize).toHaveBeenCalledTimes(4),
      { timeout: 6_500 }
    );
    expect(recognize).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      expect.objectContaining({ kind: "discovery" })
    );

    const composer = screen.getByRole("region", {
      name: /manual price entry/i
    });
    await user.click(
      within(composer).getByRole("button", {
        name: /open manual price entry/i
      })
    );
    await user.type(
      within(composer).getByRole("textbox", { name: /jpy amount/i }),
      "5,000"
    );
    await user.click(
      within(composer).getByRole("button", {
        name: /convert entered price/i
      })
    );
    await user.click(
      screen.getByRole("button", {
        name: /use focused price · jpy 4,142/i
      })
    );

    recognize.mockResolvedValue([]);
    await waitFor(() => expect(recognize).toHaveBeenCalledTimes(5));
    expect(
      document.querySelector('[data-detected-price="JPY-4142"]')
    ).toHaveClass("focused-detection");
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", {
            name: /use entered price · jpy 5,000/i
          })
        ).toBeInTheDocument(),
      { timeout: 2_500 }
    );
    await user.click(
      screen.getByRole("button", {
        name: /use entered price · jpy 5,000/i
      })
    );
    expect(screen.getByText("USD 33.56")).toBeInTheDocument();
    act(() => reportProgress(0.5, "recognizing text"));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledOnce();
  }, 10_000);

  it("outlines every confident candidate but focuses and converts only the Capture Guide-nearest price", async () => {
    const user = userEvent.setup();
    const { stream } = createMediaStream();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    const recognize = vi.fn().mockImplementation(
      async (_image: unknown, pass: RecognitionPassIdentity) =>
        pass.kind === "discovery"
          ? [
              {
                text: "4,142円",
                confidence: 96,
                box: { x: 170, y: 446, width: 160, height: 80 }
              },
              {
                text: "980円",
                confidence: 89,
                box: { x: 330, y: 200, width: 120, height: 70 }
              }
            ]
          : [
              {
                text: "4,142円",
                confidence: 96,
                box: { x: 64, y: 40, width: 160, height: 80 }
              }
            ]
    );
    const recognizer: OcrRecognizer = {
      prepare: vi.fn().mockResolvedValue(undefined),
      recognize,
      terminate: vi.fn().mockResolvedValue(undefined)
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D);

    render(
      <App
        createRecognizer={(_sourceCurrency, onProgress) => {
          onProgress(1, "ready");
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

    await waitFor(() => expect(recognize).toHaveBeenCalledTimes(4), {
      timeout: 6_500
    });
    const focused = document.querySelector('[data-detected-price="JPY-4142"]');
    const other = document.querySelector('[data-detected-price="JPY-980"]');
    await waitFor(() => expect(focused).toHaveClass("focused-detection"));
    expect(other).not.toHaveClass("focused-detection");
    expect(document.querySelectorAll("[data-detected-price]")).toHaveLength(2);
    const recognitionSummary = screen.getByRole("region", {
      name: /recognition summary/i
    });
    expect(recognitionSummary).toHaveTextContent(/Focused Price · JPY 4,142/i);
    expect(recognitionSummary).toHaveTextContent(/Detected Price · JPY 980/i);
    await waitFor(() => expect(recognize).toHaveBeenCalledTimes(5));
    expect(
      document.querySelector('[data-detected-price="JPY-980"]')
    ).toBeInTheDocument();
    expect(screen.getByText("USD 27.80")).toBeInTheDocument();
  }, 10_000);

  it("searches one Target Currency and restores Guest preferences after reload", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const firstVisit = render(<App />);

    expect(
      within(
        screen.getByRole("combobox", { name: /source currency/i })
      ).getAllByRole("option")
    ).toHaveLength(31);

    await user.selectOptions(
      screen.getByRole("combobox", { name: /source currency/i }),
      "EUR"
    );
    await user.click(
      screen.getByRole("button", {
        name: /target currencies: 1 selected · usd/i
      })
    );
    await user.type(
      screen.getByRole("searchbox", { name: /search target currencies/i }),
      "台幣"
    );
    await user.click(
      screen.getByRole("option", { name: /twd new taiwan dollar/i })
    );

    firstVisit.unmount();
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: /source currency/i })
      ).toHaveValue("EUR");
      expect(
        screen.getByRole("button", {
          name: /target currencies: 1 selected · twd/i
        })
      ).toBeInTheDocument();
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
      screen.getByRole("heading", { name: /understand any price/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /source currency/i })
    ).toHaveValue("JPY");
    localStorageGetter.mockRestore();
  });
});

describe("Approved Member journey", () => {
  it("describes the signed-in membership check without flashing Guest mode", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const pending = createDeferred<MemberPreferences | null>();

    render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={vi.fn(() => pending.promise)}
      />
    );

    expect(screen.getAllByText(/checking member access/i)).toHaveLength(2);
    expect(screen.queryByText(/guest mode/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /try without camera/i }));

    expect(screen.getByText(/checking member access/i)).toBeInTheDocument();
    expect(screen.queryByText(/guest · 1/i)).not.toBeInTheDocument();
  });

  it("creates a synchronized preference row only after active membership is confirmed", async () => {
    useMediaDevices(vi.fn());
    const saveMemberPreferences = vi.fn(
      async (preferences: MemberPreferences) => preferences
    );

    render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={vi.fn().mockResolvedValue(null)}
        saveMemberPreferences={saveMemberPreferences}
      />
    );

    expect(await screen.findByText(/approved member mode/i)).toBeInTheDocument();
    expect(saveMemberPreferences).toHaveBeenCalledWith(
      {
        ownerId: "user_member",
        sourceCurrency: "JPY",
        targetCurrencies: ["USD"]
      },
      expect.any(AbortSignal)
    );
  });

  it("restores three synchronized Target Currencies and renders a dated ledger row for each", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const loadMemberPreferences = vi.fn().mockResolvedValue({
      ownerId: "user_member",
      sourceCurrency: "JPY",
      targetCurrencies: ["USD", "TWD", "EUR"]
    });
    const loadGuestRate = vi.fn(
      async (_source: CurrencyCode, target: CurrencyCode) => ({
        ...DEFAULT_RATE,
        target,
        value:
          target === "USD" ? "0.0067123" : target === "TWD" ? "0.22" : "0.0058"
      })
    );

    render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={loadMemberPreferences}
        loadGuestRate={loadGuestRate}
      />
    );

    expect(await screen.findByText(/approved member mode/i)).toBeInTheDocument();
    expect(loadMemberPreferences).toHaveBeenCalledWith(
      "user_member",
      expect.any(AbortSignal)
    );
    const targetPicker = screen.getByRole("button", {
      name: /target currencies: 3 selected · usd · twd · eur/i
    });
    await user.click(targetPicker);
    expect(
      screen.getByRole("listbox", { name: /target currencies/i })
    ).toHaveAttribute("aria-multiselectable", "true");
    expect(
      screen.getByRole("option", { name: /cad canadian dollar/i })
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /done/i }));

    await user.click(screen.getByRole("button", { name: /try without camera/i }));

    expect(await screen.findByText("USD 27.80")).toBeInTheDocument();
    expect(screen.getByText("TWD 911.24")).toBeInTheDocument();
    expect(screen.getByText("EUR 24.02")).toBeInTheDocument();
    expect(screen.getAllByText(/reference rate/i)).toHaveLength(3);
    expect(screen.getAllByText(/effective 2026-07-30/i)).toHaveLength(3);
  });

  it("synchronizes member changes and returns to one browser-local target after sign-out", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const loadMemberPreferences = vi.fn().mockResolvedValue({
      ownerId: "user_member",
      sourceCurrency: "JPY",
      targetCurrencies: ["USD"]
    });
    const saveMemberPreferences = vi.fn(
      async (preferences: MemberPreferences) => preferences
    );
    const view = render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={loadMemberPreferences}
        saveMemberPreferences={saveMemberPreferences}
      />
    );
    await screen.findByText(/approved member mode/i);

    await user.click(
      screen.getByRole("button", {
        name: /target currencies: 1 selected · usd/i
      })
    );
    expect(
      screen.getByRole("searchbox", { name: /search target currencies/i })
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole("searchbox", { name: /search target currencies/i }),
      "台幣"
    );
    await user.click(
      screen.getByRole("option", { name: /twd new taiwan dollar/i })
    );

    await waitFor(() =>
      expect(saveMemberPreferences).toHaveBeenLastCalledWith(
        {
          ownerId: "user_member",
          sourceCurrency: "JPY",
          targetCurrencies: ["USD", "TWD"]
        },
        expect.any(AbortSignal)
      )
    );

    view.rerender(
      <App
        memberSession={null}
        loadMemberPreferences={loadMemberPreferences}
        saveMemberPreferences={saveMemberPreferences}
      />
    );

    expect(await screen.findByText(/guest mode/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /target currencies: 1 selected · usd/i
      })
    ).toBeInTheDocument();
    expect(saveMemberPreferences).toHaveBeenCalledTimes(1);
  });

  it("waits for D1 synchronization before requesting a newly selected member rate", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const saved = createDeferred<MemberPreferences>();
    const loadGuestRate = vi
      .fn()
      .mockResolvedValue(DEFAULT_RATE);
    render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={vi.fn().mockResolvedValue({
          ownerId: "user_member",
          sourceCurrency: "JPY",
          targetCurrencies: ["USD"]
        })}
        saveMemberPreferences={vi.fn(() => saved.promise)}
        loadGuestRate={loadGuestRate}
      />
    );
    await screen.findByText(/approved member mode/i);
    await user.click(
      screen.getByRole("button", {
        name: /target currencies: 1 selected · usd/i
      })
    );
    await user.click(
      screen.getByRole("option", { name: /twd new taiwan dollar/i })
    );

    expect(
      loadGuestRate.mock.calls.some((call) => call[1] === "TWD")
    ).toBe(false);

    await act(async () => {
      saved.resolve({
        ownerId: "user_member",
        sourceCurrency: "JPY",
        targetCurrencies: ["USD", "TWD"]
      });
    });
    await waitFor(() =>
      expect(
        loadGuestRate.mock.calls.some((call) => call[1] === "TWD")
      ).toBe(true)
    );
  });

  it("keeps a signed-in account at Guest limits when active membership is denied", async () => {
    useMediaDevices(vi.fn());
    const saveMemberPreferences = vi.fn();

    render(
      <App
        memberSession={{
          userId: "user_inactive",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={vi
          .fn()
          .mockRejectedValue(
            new MemberPreferencesRequestError(
              "inactive-membership",
              "inactive membership"
            )
          )}
        saveMemberPreferences={saveMemberPreferences}
      />
    );

    expect(
      await screen.findAllByText(/signed in · guest limits/i)
    ).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent(
      /active membership is not available/i
    );
    expect(
      screen.getByRole("button", {
        name: /target currencies: 1 selected · usd/i
      })
    ).toBeInTheDocument();
    expect(saveMemberPreferences).not.toHaveBeenCalled();
  });

  it("shows a signed-in access failure instead of describing it as Guest mode", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const loadMemberPreferences = vi
      .fn()
      .mockRejectedValueOnce(new Error("preference service unavailable"))
      .mockResolvedValueOnce({
        ownerId: "user_member",
        sourceCurrency: "JPY",
        targetCurrencies: ["USD"]
      });

    render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={loadMemberPreferences}
      />
    );

    expect(
      await screen.findByText(/member access unavailable/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/guest mode/i)).not.toBeInTheDocument();
    expect(screen.getByText(/signed in · access unavailable/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /target currencies: 1 selected · usd/i
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not verify approved member access/i
    );

    await user.click(
      screen.getByRole("button", { name: /retry member access/i })
    );
    expect(await screen.findByText(/approved member mode/i)).toBeInTheDocument();
    expect(loadMemberPreferences).toHaveBeenCalledTimes(2);
  });

  it("keeps unsynchronized member settings visible and retries a failed save", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const saveMemberPreferences = vi
      .fn()
      .mockRejectedValueOnce(new Error("D1 unavailable"))
      .mockImplementation(async (preferences: MemberPreferences) => preferences);
    const loadGuestRate = vi.fn().mockResolvedValue(DEFAULT_RATE);

    render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={vi.fn().mockResolvedValue({
          ownerId: "user_member",
          sourceCurrency: "JPY",
          targetCurrencies: ["USD"]
        })}
        saveMemberPreferences={saveMemberPreferences}
        loadGuestRate={loadGuestRate}
      />
    );
    await screen.findByText(/approved member mode/i);
    await user.click(
      screen.getByRole("button", {
        name: /target currencies: 1 selected · usd/i
      })
    );
    await user.click(
      screen.getByRole("option", { name: /twd new taiwan dollar/i })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /member settings were not saved/i
    );
    expect(
      screen.getByRole("button", {
        name: /target currencies: 2 selected · usd · twd/i
      })
    ).toBeInTheDocument();
    expect(loadGuestRate.mock.calls.some((call) => call[1] === "TWD")).toBe(
      false
    );

    await user.click(
      screen.getByRole("button", { name: /retry saving settings/i })
    );
    await waitFor(() => expect(saveMemberPreferences).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(loadGuestRate.mock.calls.some((call) => call[1] === "TWD")).toBe(
        true
      )
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("preserves unaffected member conversions when one Target Currency rate fails", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const loadGuestRate = vi.fn(
      async (_source: CurrencyCode, target: CurrencyCode) => {
        if (target === "TWD") {
          throw new Error("rate unavailable");
        }
        return { ...DEFAULT_RATE, target };
      }
    );

    render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={vi.fn().mockResolvedValue({
          ownerId: "user_member",
          sourceCurrency: "JPY",
          targetCurrencies: ["USD", "TWD"]
        })}
        loadGuestRate={loadGuestRate}
      />
    );
    await screen.findByText(/approved member mode/i);
    await user.click(screen.getByRole("button", { name: /try without camera/i }));

    expect(await screen.findByText("USD 27.80")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /conversion unavailable/i
    );
    expect(screen.getByLabelText(/usd conversion/i)).toBeInTheDocument();
    const usdCallsBeforeRetry = loadGuestRate.mock.calls.filter(
      (call) => call[1] === "USD"
    ).length;
    const twdCallsBeforeRetry = loadGuestRate.mock.calls.filter(
      (call) => call[1] === "TWD"
    ).length;

    await user.click(
      screen.getByRole("button", { name: /reconnect and retry/i })
    );
    expect(screen.getByText("USD 27.80")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        loadGuestRate.mock.calls.filter((call) => call[1] === "TWD")
      ).toHaveLength(twdCallsBeforeRetry + 1)
    );
    expect(
      loadGuestRate.mock.calls.filter((call) => call[1] === "USD")
    ).toHaveLength(usdCallsBeforeRetry);
  });

  it("lets an unauthorized member conversion continue immediately as a Guest", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) =>
        String(input).startsWith("/api/member-fx")
          ? Response.json(
              { error: { code: "inactive_membership" } },
              { status: 403 }
            )
          : Response.json(DEFAULT_RATE)
    );

    render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={vi.fn().mockResolvedValue({
          ownerId: "user_member",
          sourceCurrency: "JPY",
          targetCurrencies: ["USD", "TWD"]
        })}
      />
    );
    await screen.findByText(/approved member mode/i);
    await user.click(screen.getByRole("button", { name: /try without camera/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no longer authorizes this Reference Rate/i
    );
    await user.click(screen.getByRole("button", { name: /continue as Guest/i }));

    expect(await screen.findByText(/using Guest mode/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /target currencies: 1 selected · usd/i
      })
    ).toBeInTheDocument();
    expect(await screen.findByText("USD 27.80")).toBeInTheDocument();
    expect(
      fetchSpy.mock.calls.some(([input]) => String(input).startsWith("/api/fx"))
    ).toBe(true);
  });
});
