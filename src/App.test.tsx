import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import type { CurrencyCode } from "./domain/currencies";
import type {
  GuestCameraAllowanceSnapshot,
  GuestCameraAllowanceStore
} from "./domain/guestCameraAllowance";
import { GuestRateLoadError } from "./fx/browserRateSnapshot";
import type { GuestReferenceRate } from "./fx/referenceRate";
import {
  DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS,
  type MemberPreferences
} from "./member/memberPreferencesApi";
import { MemberPreferencesRequestError } from "./member/memberPreferencesClient";
import type {
  OcrRecognizer,
  RecognitionPassIdentity,
  RecognizerObservation
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

function createAllowanceStore(
  snapshot: GuestCameraAllowanceSnapshot = {
    used: 0,
    remaining: 10,
    isExhausted: false,
    nextRefreshAtMs: null
  }
): GuestCameraAllowanceStore {
  return {
    getSnapshot: vi.fn(() => snapshot),
    recordSuccessfulUsage: vi.fn(async () => ({
      charged: true,
      snapshot: {
        used: snapshot.used + 1,
        remaining: snapshot.remaining - 1,
        isExhausted: snapshot.remaining === 1,
        nextRefreshAtMs: snapshot.remaining === 1 ? Date.now() + 3_600_000 : null
      }
    }))
  };
}

function canvasContext(): CanvasRenderingContext2D {
  return {
    drawImage: vi.fn(),
    getImageData: (
      _x: number,
      _y: number,
      width: number,
      height: number
    ) =>
      ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
        colorSpace: "srgb"
      }) as ImageData,
    createImageData: (width: number, height: number) =>
      ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
        colorSpace: "srgb"
      }) as ImageData,
    putImageData: vi.fn()
  } as unknown as CanvasRenderingContext2D;
}

function idleRecognizer(
  preparation: Promise<void> = Promise.resolve()
): OcrRecognizer {
  return {
    prepare: vi.fn(() => preparation),
    recognize: vi.fn().mockResolvedValue([]),
    terminate: vi.fn().mockResolvedValue(undefined)
  };
}

function recognizedObservation(
  text: string,
  confidence: number,
  box: { x: number; y: number; width: number; height: number },
  passIdentity: RecognitionPassIdentity
): RecognizerObservation {
  const scale = passIdentity.preprocessingIdentity === "raw" ? 1 : 2;
  const scaledBox = {
    x: box.x * scale,
    y: box.y * scale,
    width: box.width * scale,
    height: box.height * scale
  };
  return {
    text,
    evidenceKind: "text",
    confidence,
    line: { blockIndex: 0, paragraphIndex: 0, lineIndex: 0 },
    box: scaledBox,
    polygon: [
      { x: scaledBox.x, y: scaledBox.y },
      { x: scaledBox.x + scaledBox.width, y: scaledBox.y },
      {
        x: scaledBox.x + scaledBox.width,
        y: scaledBox.y + scaledBox.height
      },
      { x: scaledBox.x, y: scaledBox.y + scaledBox.height }
    ],
    timing: { startedAtMs: 1, completedAtMs: 2, durationMs: 1 },
    passIdentity
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  Object.defineProperty(window.navigator, "locks", {
    configurable: true,
    value: {
      request: async (
        _name: string,
        _options: LockOptions,
        transaction: () => unknown
      ) => transaction()
    }
  });
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
    const cameraPermission = createDeferred<MediaStream>();
    useMediaDevices(vi.fn().mockReturnValue(cameraPermission.promise));

    render(
      <App
        createRecognizer={() =>
          idleRecognizer(cameraPermission.promise.then(() => undefined))
        }
      />
    );
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

  it("keeps a visitor without camera access on Manual Price Entry", async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn();
    const createRecognizer = vi.fn(() => {
      throw new Error("recognition must remain unloaded");
    });
    useMediaDevices(getUserMedia);

    render(
      <App
        createRecognizer={createRecognizer}
        resolveCameraAccess={() => false}
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
      screen.getByText(/camera recognition is unavailable for this access mode/i)
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

describe("anonymous recognition-health consent", () => {
  it("keeps the first session silent and applies opt-in only to a future camera session", async () => {
    const user = userEvent.setup();
    useMediaDevices(
      vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"))
    );
    const submitRecognitionHealth = vi.fn().mockResolvedValue(undefined);

    render(<App submitRecognitionHealth={submitRecognitionHealth} />);
    expect(
      screen.queryByRole("region", {
        name: /anonymous recognition health invitation/i
      })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open camera/i }));
    await screen.findByText(/camera access was denied/i);
    expect(
      screen.getByRole("button", { name: /source currency: jpy/i })
    ).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /close camera/i }));

    const invitation = screen.getByRole("region", {
      name: /anonymous recognition health invitation/i
    });
    expect(invitation).toHaveTextContent(/app release and summary schema/i);
    expect(invitation).toHaveTextContent(/coarse platform family and source currency/i);
    expect(invitation).toHaveTextContent(/bucketed recognition pass, miss, focus-change/i);
    expect(invitation).toHaveTextContent(/no account or stable identifier/i);
    expect(submitRecognitionHealth).not.toHaveBeenCalled();

    await user.click(
      within(invitation).getByRole("button", {
        name: /share future summaries/i
      })
    );
    await user.click(screen.getByRole("button", { name: /open camera/i }));
    await screen.findByText(/camera access was denied/i);
    await user.click(screen.getByRole("button", { name: /close camera/i }));

    expect(submitRecognitionHealth).toHaveBeenCalledOnce();
    const summary = submitRecognitionHealth.mock.calls[0][0];
    expect(summary).toMatchObject({
      schemaVersion: 1,
      release: "0.1.0",
      sourceCurrency: "JPY",
      terminalOutcome: "camera-permission-denied",
      errorFamily: "camera-permission"
    });
    expect(Object.keys(summary).sort()).toEqual(
      [
        "schemaVersion",
        "release",
        "platform",
        "sourceCurrency",
        "timeToReady",
        "timeToFirstDetectedPrice",
        "timeToFirstFocusedPrice",
        "recognitionPassCount",
        "missCount",
        "focusChangeCount",
        "stableDetectionCount",
        "terminalOutcome",
        "errorFamily"
      ].sort()
    );
  });

  it("keeps Not now dismissed and lets Privacy settings stop future summaries", async () => {
    const user = userEvent.setup();
    useMediaDevices(
      vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"))
    );
    const submitRecognitionHealth = vi.fn().mockResolvedValue(undefined);

    render(<App submitRecognitionHealth={submitRecognitionHealth} />);
    await user.click(screen.getByRole("button", { name: /open camera/i }));
    await screen.findByText(/camera access was denied/i);
    await user.click(screen.getByRole("button", { name: /close camera/i }));
    await user.click(screen.getByRole("button", { name: /not now/i }));

    await user.click(screen.getByRole("button", { name: /open camera/i }));
    await screen.findByText(/camera access was denied/i);
    await user.click(screen.getByRole("button", { name: /close camera/i }));
    expect(
      screen.queryByRole("region", {
        name: /anonymous recognition health invitation/i
      })
    ).not.toBeInTheDocument();
    expect(submitRecognitionHealth).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /privacy settings/i }));
    const settings = screen.getByRole("region", { name: /privacy settings/i });
    const toggle = within(settings).getByRole("checkbox", {
      name: /share for future camera sessions/i
    });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    await user.click(
      within(settings).getByRole("button", { name: /close settings/i })
    );

    await user.click(screen.getByRole("button", { name: /open camera/i }));
    await screen.findByText(/camera access was denied/i);
    await user.click(screen.getByRole("button", { name: /close camera/i }));
    expect(submitRecognitionHealth).not.toHaveBeenCalled();
  });

  it("lets an opted-in shopper turn sharing off before closing the camera", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "taglingo.recognition-health.v1",
      JSON.stringify({
        version: 1,
        sharingEnabled: true,
        invitationShown: true
      })
    );
    useMediaDevices(
      vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"))
    );
    const submitRecognitionHealth = vi.fn().mockResolvedValue(undefined);

    render(<App submitRecognitionHealth={submitRecognitionHealth} />);
    await user.click(screen.getByRole("button", { name: /open camera/i }));
    await screen.findByText(/camera access was denied/i);

    await user.click(
      screen.getByRole("button", { name: /privacy settings/i })
    );
    const settings = screen.getByRole("region", { name: /privacy settings/i });
    const toggle = within(settings).getByRole("checkbox", {
      name: /share for future camera sessions/i
    });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: /close camera/i }));

    expect(submitRecognitionHealth).not.toHaveBeenCalled();
    expect(
      JSON.parse(
        window.localStorage.getItem("taglingo.recognition-health.v1") ?? "null"
      )
    ).toMatchObject({ sharingEnabled: false, invitationShown: true });
  });

  it("does not report recognition readiness when initialization fails", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "taglingo.recognition-health.v1",
      JSON.stringify({
        version: 1,
        sharingEnabled: true,
        invitationShown: true
      })
    );
    const { stream } = createMediaStream();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext()
    );
    const recognizer: OcrRecognizer = {
      prepare: vi.fn().mockRejectedValue(new Error("unavailable")),
      recognize: vi.fn(),
      terminate: vi.fn().mockResolvedValue(undefined)
    };
    const submitRecognitionHealth = vi.fn().mockResolvedValue(undefined);

    render(
      <App
        createRecognizer={() => recognizer}
        submitRecognitionHealth={submitRecognitionHealth}
      />
    );
    await user.click(screen.getByRole("button", { name: /open camera/i }));
    const video = await screen.findByLabelText(/rear camera preview/i);
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1920 },
      videoHeight: { configurable: true, value: 1080 }
    });
    fireEvent.loadedMetadata(video);
    await screen.findByText(/recognition could not start/i);
    await user.click(screen.getByRole("button", { name: /close camera/i }));

    expect(submitRecognitionHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        timeToReady: "not-reached",
        terminalOutcome: "recognition-initialization-failed",
        errorFamily: "recognition-initialization"
      })
    );
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

  it("explains the successful-usage rule and unlimited Manual Price Entry", () => {
    useMediaDevices(vi.fn());

    render(<App />);

    expect(
      screen.getByRole("complementary", { name: /guest camera allowance/i })
    ).toHaveTextContent(/10 of 10 successful camera usages remain/i);
    expect(
      screen.getByRole("complementary", { name: /guest camera allowance/i })
    ).toHaveTextContent(/browser-local allowance/i);
    expect(
      screen.getByRole("complementary", { name: /guest camera allowance/i })
    ).toHaveTextContent(/first Focused Price/i);
    expect(
      screen.getByRole("complementary", { name: /guest camera allowance/i })
    ).toHaveTextContent(/manual price entry remains unlimited/i);
  });

  it("does not charge camera starts, failures, cancellations, or the no-camera demo", async () => {
    const user = userEvent.setup();
    const allowanceStore = createAllowanceStore();
    useMediaDevices(
      vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"))
    );

    render(<App guestCameraAllowanceStore={allowanceStore} />);
    await user.click(screen.getByRole("button", { name: /open camera/i }));
    await screen.findByText(/camera access was denied/i);
    await user.click(screen.getByRole("button", { name: /close camera/i }));
    expect(allowanceStore.recordSuccessfulUsage).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /try without camera/i }));
    await within(
      screen.getByRole("region", { name: /recognition summary/i })
    ).findByText(/^focused price · jpy 4,142$/i);
    await user.click(screen.getByRole("button", { name: /close camera/i }));
    expect(allowanceStore.recordSuccessfulUsage).not.toHaveBeenCalled();
  });

  it("disables Guest camera at ten usages, shows refresh, and re-enables at expiry", () => {
    vi.useFakeTimers();
    const nowMs = Date.parse("2026-08-04T10:00:00.000Z");
    const refreshAtMs = nowMs + 3_600_000;
    vi.setSystemTime(nowMs);
    const allowanceStore: GuestCameraAllowanceStore = {
      getSnapshot: vi.fn(() =>
        Date.now() < refreshAtMs
          ? {
              used: 10,
              remaining: 0,
              isExhausted: true,
              nextRefreshAtMs: refreshAtMs
            }
          : {
              used: 9,
              remaining: 1,
              isExhausted: false,
              nextRefreshAtMs: null
            }
      ),
      recordSuccessfulUsage: vi.fn(async () => ({
        charged: false,
        snapshot: {
          used: 10,
          remaining: 0,
          isExhausted: true,
          nextRefreshAtMs: refreshAtMs
        }
      }))
    };
    useMediaDevices(vi.fn());

    render(<App guestCameraAllowanceStore={allowanceStore} />);

    expect(
      screen.getByRole("button", { name: /open camera · allowance used/i })
    ).toBeDisabled();
    expect(
      screen.getByRole("complementary", { name: /guest camera allowance/i })
    ).toHaveTextContent(/camera refreshes at/i);
    expect(
      screen.getByRole("button", { name: /enter price manually · unlimited/i })
    ).toBeEnabled();

    act(() => vi.advanceTimersByTime(3_600_000));

    expect(screen.getByRole("button", { name: /open camera/i })).toBeEnabled();
    expect(
      screen.getByRole("complementary", { name: /guest camera allowance/i })
    ).toHaveTextContent(/1 of 10 successful camera usages remain/i);
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

    render(<App createRecognizer={() => idleRecognizer()} />);

    expect(
      screen.getByRole("heading", { name: /understand any price/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/camera frames stay on this device/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /recognition limitations are handled through Manual Price Entry/i
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

    render(<App createRecognizer={() => idleRecognizer()} />);
    await user.click(screen.getByRole("button", { name: /open camera/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /camera access was denied/i
    );
    const promotedInput = await screen.findByRole("textbox", {
      name: /jpy amount/i
    });
    expect(promotedInput).toBeInTheDocument();
    expect(promotedInput).not.toHaveFocus();

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

    render(<App createRecognizer={() => idleRecognizer()} />);
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
      /preparing recognition/i
    );
    await act(async () => {
      vi.advanceTimersByTime(160);
    });
    expect(
      screen.getByText(/focused price · jpy 4,142/i)
    ).toBeInTheDocument();
    const detectedPriceList = screen.getByRole("list", {
      name: /detected prices/i
    });
    expect(within(detectedPriceList).getAllByRole("button")).toHaveLength(1);
    expect(
      within(detectedPriceList).getByRole("button", {
        name: /price 1 of 1, jpy 4,142/i
      })
    ).toHaveAttribute("aria-current", "true");
    expect(document.querySelector(".detected-price")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(
      screen.queryByRole("button", {
        name: /focused price detection outline · jpy 4,142/i
      })
    ).not.toBeInTheDocument();
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
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext()
    );
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
        name: /preparing recognition/i
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

  it("starts recognition preparation concurrently with camera permission", async () => {
    const user = userEvent.setup();
    const cameraPermission = createDeferred<MediaStream>();
    const runtimePreparation = createDeferred<void>();
    const getUserMedia = vi.fn(() => cameraPermission.promise);
    useMediaDevices(getUserMedia);
    const recognizer: OcrRecognizer = {
      prepare: vi.fn(() => runtimePreparation.promise),
      recognize: vi.fn().mockResolvedValue([]),
      terminate: vi.fn().mockResolvedValue(undefined)
    };

    render(<App createRecognizer={() => recognizer} />);
    await user.click(screen.getByRole("button", { name: /open camera/i }));

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(recognizer.prepare).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("progressbar", { name: /preparing recognition/i })
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/manual price entry remains available/i)
    ).not.toHaveLength(0);

    const { stream } = createMediaStream();
    await act(async () => cameraPermission.resolve(stream));
    expect(await screen.findByLabelText(/rear camera preview/i)).toBeVisible();

    await act(async () => runtimePreparation.resolve());
  });

  it("keeps shared recognition preparation alive through Strict Mode replay", async () => {
    const user = userEvent.setup();
    const { stream } = createMediaStream();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    const recognizer = idleRecognizer();

    render(
      <StrictMode>
        <App createRecognizer={() => recognizer} />
      </StrictMode>
    );
    await user.click(screen.getByRole("button", { name: /open camera/i }));

    expect(await screen.findByLabelText(/rear camera preview/i)).toBeVisible();
    expect(recognizer.prepare).toHaveBeenCalledOnce();
    expect(recognizer.terminate).not.toHaveBeenCalled();
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
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext()
    );

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
      screen.queryByRole("button", { name: /use no-camera demo/i })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /try recognition again/i })
    );

    expect(await screen.findByText(/no Detected Price yet/i)).toBeInTheDocument();
    expect(createRecognizer).toHaveBeenCalledTimes(2);
  });

  it("moves an active camera session to Manual Price Entry when access is revoked", async () => {
    const user = userEvent.setup();
    const { stream, track } = createMediaStream();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext()
    );
    const recognizer: OcrRecognizer = {
      prepare: vi.fn().mockResolvedValue(undefined),
      recognize: vi.fn().mockResolvedValue([]),
      terminate: vi.fn().mockResolvedValue(undefined)
    };
    const createRecognizer = () => recognizer;
    let cameraAllowed = true;
    const resolveCameraAccess = () => cameraAllowed;
    const app = () => (
      <App
        createRecognizer={createRecognizer}
        resolveCameraAccess={resolveCameraAccess}
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

    cameraAllowed = false;
    view.rerender(app());

    expect(
      await screen.findByRole("textbox", { name: /jpy amount/i })
    ).toBeInTheDocument();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(recognizer.terminate).not.toHaveBeenCalled();
  });

  it("reuses one prepared runtime across Source Currency sessions", async () => {
    const user = userEvent.setup();
    const { stream, track } = createMediaStream();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext()
    );
    const recognizer = {
      prepare: vi.fn().mockResolvedValue(undefined),
      recognize: vi.fn().mockResolvedValue([]),
      terminate: vi.fn().mockResolvedValue(undefined)
    } satisfies OcrRecognizer;
    const createRecognizer = vi.fn(() => recognizer);

    render(
      <App
        createRecognizer={createRecognizer}
        resolveCameraAccess={() => true}
      />
    );

    await user.click(screen.getByRole("button", { name: /open camera/i }));
    const video = await screen.findByLabelText(/rear camera preview/i);
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1920 },
      videoHeight: { configurable: true, value: 1080 }
    });
    fireEvent.loadedMetadata(video);
    await waitFor(() => expect(recognizer.prepare).toHaveBeenCalledOnce());

    await user.click(screen.getByRole("button", { name: /close camera/i }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: /source currency/i }),
      "USD"
    );
    await user.click(screen.getByRole("button", { name: /open camera/i }));
    const nextVideo = await screen.findByLabelText(/rear camera preview/i);
    Object.defineProperties(nextVideo, {
      videoWidth: { configurable: true, value: 1920 },
      videoHeight: { configurable: true, value: 1080 }
    });
    fireEvent.loadedMetadata(nextVideo);
    await act(async () => Promise.resolve());
    expect(createRecognizer).toHaveBeenCalledOnce();
    expect(recognizer.prepare).toHaveBeenCalledOnce();
    expect(recognizer.terminate).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("stabilizes browser-local camera observations without uploading them", async () => {
    const user = userEvent.setup();
    const allowanceStore = createAllowanceStore();
    const { stream } = createMediaStream();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    const recognize = vi
      .fn()
      .mockImplementation(
        async (_image: unknown, pass: RecognitionPassIdentity) => [
          recognizedObservation(
            "4,142円",
            96,
            pass.kind === "discovery"
              ? { x: 170, y: 446, width: 160, height: 80 }
              : { x: 64, y: 40, width: 160, height: 80 },
            pass
          )
        ]
      );
    const recognizer: OcrRecognizer = {
      prepare: vi.fn().mockResolvedValue(undefined),
      recognize,
      terminate: vi.fn().mockResolvedValue(undefined)
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext()
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    let reportProgress: (progress: number, status: string) => void =
      () => undefined;

    render(
      <App
        guestCameraAllowanceStore={allowanceStore}
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
    await waitFor(() =>
      expect(allowanceStore.recordSuccessfulUsage).toHaveBeenCalledOnce()
    );
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
      () => expect(recognize.mock.calls.length).toBeGreaterThanOrEqual(12),
      { timeout: 6_500 }
    );
    expect(recognize).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      expect.objectContaining({ kind: "discovery" })
    );
    expect(allowanceStore.recordSuccessfulUsage).toHaveBeenCalledOnce();

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

    const callsBeforeMiss = recognize.mock.calls.length;
    recognize.mockResolvedValue([]);
    await waitFor(
      () =>
        expect(recognize.mock.calls.length).toBeGreaterThanOrEqual(
          callsBeforeMiss + 3
        ),
      { timeout: 6_500 }
    );
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
  }, 20_000);

  it.each([
    ["keeps the intentional tenth successful session open", true],
    ["stops a stale concurrent session when its atomic charge is denied", false]
  ])("%s", async (_case, charged) => {
    const user = userEvent.setup();
    const { stream, track } = createMediaStream();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext()
    );
    const allowanceStore: GuestCameraAllowanceStore = {
      getSnapshot: vi.fn(() => ({
        used: 9,
        remaining: 1,
        isExhausted: false,
        nextRefreshAtMs: null
      })),
      recordSuccessfulUsage: vi.fn(async () => ({
        charged,
        snapshot: {
          used: 10,
          remaining: 0,
          isExhausted: true,
          nextRefreshAtMs: Date.now() + 3_600_000
        }
      }))
    };
    const successfulRecognition = async (
      _image: unknown,
      pass: RecognitionPassIdentity
    ) =>
      [
          recognizedObservation(
            "4,142円",
            96,
            { x: 64, y: 40, width: 160, height: 80 },
            pass
          )
        ];
    const recognize = vi.fn(successfulRecognition);
    const recognizer: OcrRecognizer = {
      prepare: vi.fn().mockResolvedValue(undefined),
      recognize,
      terminate: vi.fn().mockResolvedValue(undefined)
    };

    render(
      <App
        guestCameraAllowanceStore={allowanceStore}
        createRecognizer={() => recognizer}
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

    await waitFor(
      () => expect(allowanceStore.recordSuccessfulUsage).toHaveBeenCalledOnce(),
      { timeout: 3_000 }
    );
    if (charged) {
      expect(
        screen.getByRole("button", { name: /close camera/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("status", { name: /price used for conversion/i })
      ).toHaveTextContent(/focused price in use/i);
      expect(track.stop).not.toHaveBeenCalled();
    } else {
      expect(
        await screen.findByRole("heading", { name: /manual price entry/i })
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/rear camera preview/i)).not.toBeInTheDocument();
      expect(track.stop).toHaveBeenCalledOnce();
    }
  }, 10_000);

  it("ignores a denied charge that resolves after its camera session closes", async () => {
    const user = userEvent.setup();
    const { stream } = createMediaStream();
    const pendingCharge = createDeferred<
      Awaited<ReturnType<GuestCameraAllowanceStore["recordSuccessfulUsage"]>>
    >();
    const allowanceStore: GuestCameraAllowanceStore = {
      getSnapshot: vi.fn(() => ({
        used: 9,
        remaining: 1,
        isExhausted: false,
        nextRefreshAtMs: null
      })),
      recordSuccessfulUsage: vi.fn(() => pendingCharge.promise)
    };
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext()
    );
    const recognizer: OcrRecognizer = {
      prepare: vi.fn().mockResolvedValue(undefined),
      recognize: vi.fn(
        async (_image: unknown, pass: RecognitionPassIdentity) => [
          recognizedObservation(
            "4,142円",
            96,
            { x: 64, y: 40, width: 160, height: 80 },
            pass
          )
        ]
      ),
      terminate: vi.fn().mockResolvedValue(undefined)
    };

    render(
      <App
        guestCameraAllowanceStore={allowanceStore}
        createRecognizer={() => recognizer}
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
    await waitFor(
      () => expect(allowanceStore.recordSuccessfulUsage).toHaveBeenCalledOnce(),
      { timeout: 6_500 }
    );

    await user.click(screen.getByRole("button", { name: /close camera/i }));
    await act(async () => {
      pendingCharge.resolve({
        charged: false,
        denialReason: "exhausted",
        snapshot: {
          used: 10,
          remaining: 0,
          isExhausted: true,
          nextRefreshAtMs: Date.now() + 3_600_000
        }
      });
    });

    expect(
      screen.getByRole("heading", { name: /understand any price/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /^manual price entry$/i })
    ).not.toBeInTheDocument();
  }, 10_000);

  it("automatically focuses the Guide-nearest price and lets its accessible peer be selected", async () => {
    const user = userEvent.setup();
    const { stream } = createMediaStream();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    const recognize = vi.fn().mockImplementation(
      async (_image: unknown, pass: RecognitionPassIdentity) =>
        [
          recognizedObservation(
            "4,142円",
            96,
            { x: 64, y: 40, width: 160, height: 80 },
            pass
          ),
          recognizedObservation(
            "980円",
            89,
            { x: 330, y: 200, width: 120, height: 70 },
            pass
          )
        ]
    );
    const recognizer: OcrRecognizer = {
      prepare: vi.fn().mockResolvedValue(undefined),
      recognize,
      terminate: vi.fn().mockResolvedValue(undefined)
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext()
    );

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

    await waitFor(
      () => expect(recognize.mock.calls.length).toBeGreaterThanOrEqual(6),
      { timeout: 6_500 }
    );
    const focused = await waitFor(() => {
      const element = document.querySelector(
        '[data-detected-price="JPY-4142"]'
      );
      expect(element).toHaveClass("focused-detection");
      return element;
    });
    const other = document.querySelector('[data-detected-price="JPY-980"]');
    expect(other).not.toHaveClass("focused-detection");
    expect(document.querySelectorAll("[data-detected-price]")).toHaveLength(2);
    const recognitionSummary = screen.getByRole("region", {
      name: /recognition summary/i
    });
    expect(recognitionSummary).toHaveTextContent(/Focused Price · JPY 4,142/i);
    const detectedPriceButtons = within(
      screen.getByRole("list", { name: /detected prices/i })
    ).getAllByRole("button");
    expect(detectedPriceButtons).toHaveLength(2);
    expect(
      detectedPriceButtons.find((button) =>
        button.getAttribute("aria-label")?.includes("JPY 4,142")
      )
    ).toHaveAttribute("aria-current", "true");
    expect(
      detectedPriceButtons.find((button) =>
        button.getAttribute("aria-label")?.includes("JPY 980")
      )
    ).not.toHaveAttribute("aria-current");
    await user.click(
      detectedPriceButtons.find((button) =>
        button.getAttribute("aria-label")?.includes("JPY 980")
      )!
    );
    await waitFor(() => expect(other).toHaveClass("focused-detection"));
    expect(focused).not.toHaveClass("focused-detection");
    expect(recognitionSummary).toHaveTextContent(/Focused Price · JPY 980/i);
    expect(screen.getByText("USD 6.58")).toBeInTheDocument();
    const callsBeforeNextPass = recognize.mock.calls.length;
    await waitFor(
      () =>
        expect(recognize.mock.calls.length).toBeGreaterThanOrEqual(
          callsBeforeNextPass + 3
        ),
      { timeout: 2_500 }
    );
    expect(
      document.querySelector('[data-detected-price="JPY-980"]')
    ).toHaveClass("focused-detection");
    expect(screen.getByText("USD 6.58")).toBeInTheDocument();
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
  it("never reads or writes the Guest Camera Allowance", async () => {
    useMediaDevices(vi.fn());
    const allowanceStore = createAllowanceStore({
      used: 10,
      remaining: 0,
      isExhausted: true,
      nextRefreshAtMs: Date.now() + 60_000
    });

    render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={vi.fn().mockResolvedValue({
          ownerId: "user_member",
          sourceCurrency: "CAD",
          targetCurrencies: ["USD"],
          ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
        })}
        guestCameraAllowanceStore={allowanceStore}
      />
    );

    expect(await screen.findByText(/approved member mode/i)).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /source currency/i })
    ).toHaveValue("CAD");
    expect(screen.getByRole("button", { name: /open camera/i })).toBeEnabled();
    expect(allowanceStore.getSnapshot).not.toHaveBeenCalled();
    expect(allowanceStore.recordSuccessfulUsage).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("complementary", { name: /guest camera allowance/i })
    ).not.toBeInTheDocument();
  });

  it("synchronizes only the two closed Recognition Experience Settings", async () => {
    const user = userEvent.setup();
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
        loadMemberPreferences={vi.fn().mockResolvedValue({
          ownerId: "user_member",
          sourceCurrency: "JPY",
          targetCurrencies: ["USD"],
          manualEntryPromotion: "after-3-seconds",
          focusedPriceBehavior: "confirm"
        })}
        saveMemberPreferences={saveMemberPreferences}
      />
    );

    expect(await screen.findByText(/approved member mode/i)).toBeInTheDocument();
    const settings = screen.getByRole("region", {
      name: /recognition experience settings/i
    });
    const promotion = within(settings).getByRole("combobox", {
      name: /show manual price entry/i
    });
    const focusedBehavior = within(settings).getByRole("combobox", {
      name: /when a focused price appears/i
    });
    expect(within(promotion).getAllByRole("option")).toHaveLength(4);
    expect(within(focusedBehavior).getAllByRole("option")).toHaveLength(2);
    expect(settings).toHaveTextContent(
      /confidence, evidence, notation, geometry, preprocessing, and stability are not shopper-editable/i
    );

    await user.selectOptions(promotion, "after-10-seconds");
    await waitFor(() =>
      expect(saveMemberPreferences).toHaveBeenLastCalledWith(
        {
          ownerId: "user_member",
          sourceCurrency: "JPY",
          targetCurrencies: ["USD"],
          manualEntryPromotion: "after-10-seconds",
          focusedPriceBehavior: "confirm"
        },
        expect.any(AbortSignal)
      )
    );
  });

  it("uses the synchronized three-second Manual Price Entry promotion", async () => {
    vi.useFakeTimers();
    const pendingCamera = createDeferred<MediaStream>();
    useMediaDevices(vi.fn(() => pendingCamera.promise));
    const loaded = createDeferred<MemberPreferences | null>();

    render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={vi.fn(() => loaded.promise)}
      />
    );
    await act(async () => {
      loaded.resolve({
        ownerId: "user_member",
        sourceCurrency: "JPY",
        targetCurrencies: ["USD"],
        manualEntryPromotion: "after-3-seconds",
        focusedPriceBehavior: "automatic"
      });
    });
    fireEvent.click(screen.getByRole("button", { name: /open camera/i }));
    const composer = screen.getByRole("region", {
      name: /manual price entry/i
    });

    act(() => vi.advanceTimersByTime(2_999));
    expect(
      within(composer).queryByRole("textbox", { name: /jpy amount/i })
    ).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(
      within(composer).getByRole("textbox", { name: /jpy amount/i })
    ).toBeInTheDocument();
  });

  it("keeps request-only Manual Price Entry collapsed after camera failure", async () => {
    const user = userEvent.setup();
    useMediaDevices(
      vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"))
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
          targetCurrencies: ["USD"],
          manualEntryPromotion: "only-on-request",
          focusedPriceBehavior: "automatic"
        })}
      />
    );
    await screen.findByText(/approved member mode/i);
    await user.click(screen.getByRole("button", { name: /open camera/i }));
    await screen.findByText(/camera access was denied/i);

    const composer = screen.getByRole("region", {
      name: /manual price entry/i
    });
    expect(
      within(composer).queryByRole("textbox", { name: /jpy amount/i })
    ).not.toBeInTheDocument();
    expect(
      within(composer).getByRole("button", {
        name: /open manual price entry/i
      })
    ).toBeEnabled();
  });

  it("aborts an account A load and never renders its stale preferences after switching to B", async () => {
    useMediaDevices(vi.fn());
    const accountA = createDeferred<MemberPreferences | null>();
    const accountB = createDeferred<MemberPreferences | null>();
    const signals = new Map<string, AbortSignal>();
    const loadMemberPreferences = vi.fn(
      (ownerId: string, signal: AbortSignal) => {
        signals.set(ownerId, signal);
        return ownerId === "user_a" ? accountA.promise : accountB.promise;
      }
    );
    const loadGuestRate = vi.fn().mockResolvedValue(DEFAULT_RATE);
    const view = render(
      <App
        memberSession={{
          userId: "user_a",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={loadMemberPreferences}
        loadGuestRate={loadGuestRate}
      />
    );
    await screen.findAllByText(/checking member access/i);

    view.rerender(
      <App
        memberSession={{
          userId: "user_b",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={loadMemberPreferences}
        loadGuestRate={loadGuestRate}
      />
    );
    expect(signals.get("user_a")).toHaveProperty("aborted", true);
    expect(screen.queryByText(/approved member mode/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /source currency/i })
    ).toHaveValue("JPY");

    await act(async () => {
      accountA.resolve({
        ownerId: "user_a",
        sourceCurrency: "EUR",
        targetCurrencies: ["USD"],
        ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
      });
    });
    expect(
      screen.getByRole("combobox", { name: /source currency/i })
    ).not.toHaveValue("EUR");
    expect(loadGuestRate.mock.calls.some(([source]) => source === "EUR")).toBe(
      false
    );

    await act(async () => {
      accountB.resolve({
        ownerId: "user_b",
        sourceCurrency: "CAD",
        targetCurrencies: ["USD"],
        ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
      });
    });
    expect(await screen.findByText(/approved member mode/i)).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /source currency/i })
    ).toHaveValue("CAD");
  });

  it("aborts an account A save and ignores its stale completion after switching to B", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const accountASave = createDeferred<MemberPreferences>();
    const accountBLoad = createDeferred<MemberPreferences | null>();
    let accountASaveSignal: AbortSignal | null = null;
    const loadMemberPreferences = vi.fn((ownerId: string) =>
      ownerId === "user_a"
        ? Promise.resolve({
            ownerId: "user_a",
            sourceCurrency: "JPY" as const,
            targetCurrencies: ["USD" as const],
            ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
          })
        : accountBLoad.promise
    );
    const saveMemberPreferences = vi.fn(
      (preferences: MemberPreferences, signal: AbortSignal) => {
        accountASaveSignal = signal;
        return accountASave.promise;
      }
    );
    const view = render(
      <App
        memberSession={{
          userId: "user_a",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={loadMemberPreferences}
        saveMemberPreferences={saveMemberPreferences}
      />
    );
    await screen.findByText(/approved member mode/i);
    await user.selectOptions(
      screen.getByRole("combobox", { name: /source currency/i }),
      "EUR"
    );
    await waitFor(() => expect(saveMemberPreferences).toHaveBeenCalledOnce());

    view.rerender(
      <App
        memberSession={{
          userId: "user_b",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={loadMemberPreferences}
        saveMemberPreferences={saveMemberPreferences}
      />
    );
    expect(accountASaveSignal).toHaveProperty("aborted", true);
    expect(screen.queryByText(/approved member mode/i)).not.toBeInTheDocument();

    await act(async () => {
      accountASave.resolve({
        ownerId: "user_a",
        sourceCurrency: "EUR",
        targetCurrencies: ["USD"],
        ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
      });
    });
    expect(
      screen.getByRole("combobox", { name: /source currency/i })
    ).not.toHaveValue("EUR");

    await act(async () => {
      accountBLoad.resolve({
        ownerId: "user_b",
        sourceCurrency: "CAD",
        targetCurrencies: ["USD"],
        ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
      });
    });
    expect(await screen.findByText(/approved member mode/i)).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /source currency/i })
    ).toHaveValue("CAD");
  });

  it("aborts a pending member load on sign-out and ignores its completion", async () => {
    useMediaDevices(vi.fn());
    const pending = createDeferred<MemberPreferences | null>();
    let loadSignal: AbortSignal | null = null;
    const loadMemberPreferences = vi.fn(
      (_ownerId: string, signal: AbortSignal) => {
        loadSignal = signal;
        return pending.promise;
      }
    );
    const view = render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={loadMemberPreferences}
      />
    );
    await screen.findAllByText(/checking member access/i);

    view.rerender(
      <App memberSession={null} loadMemberPreferences={loadMemberPreferences} />
    );
    expect(loadSignal).toHaveProperty("aborted", true);
    await act(async () => {
      pending.resolve({
        ownerId: "user_member",
        sourceCurrency: "EUR",
        targetCurrencies: ["USD"],
        ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
      });
    });
    expect(await screen.findByText(/guest mode/i)).toBeInTheDocument();
    expect(screen.queryByText(/approved member mode/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", {
        name: /recognition experience settings/i
      })
    ).not.toBeInTheDocument();
  });

  it("aborts a pending member save on sign-out and ignores its completion", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const pendingSave = createDeferred<MemberPreferences>();
    let saveSignal: AbortSignal | null = null;
    const saveMemberPreferences = vi.fn(
      (_preferences: MemberPreferences, signal: AbortSignal) => {
        saveSignal = signal;
        return pendingSave.promise;
      }
    );
    const view = render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={vi.fn().mockResolvedValue({
          ownerId: "user_member",
          sourceCurrency: "JPY",
          targetCurrencies: ["USD"],
          ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
        })}
        saveMemberPreferences={saveMemberPreferences}
      />
    );
    await screen.findByText(/approved member mode/i);
    await user.selectOptions(
      screen.getByRole("combobox", { name: /source currency/i }),
      "EUR"
    );
    await waitFor(() => expect(saveMemberPreferences).toHaveBeenCalledOnce());

    view.rerender(
      <App
        memberSession={null}
        saveMemberPreferences={saveMemberPreferences}
      />
    );
    expect(saveSignal).toHaveProperty("aborted", true);
    await act(async () => {
      pendingSave.resolve({
        ownerId: "user_member",
        sourceCurrency: "EUR",
        targetCurrencies: ["USD"],
        ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
      });
    });
    expect(await screen.findByText(/guest mode/i)).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /source currency/i })
    ).toHaveValue("JPY");
    expect(screen.queryByText(/approved member mode/i)).not.toBeInTheDocument();
  });

  it("keeps an only-on-request Manual Price Entry collapsed", async () => {
    vi.useFakeTimers();
    const pendingCamera = createDeferred<MediaStream>();
    useMediaDevices(vi.fn(() => pendingCamera.promise));
    const loaded = createDeferred<MemberPreferences | null>();

    render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={vi.fn(() => loaded.promise)}
      />
    );
    await act(async () => {
      loaded.resolve({
        ownerId: "user_member",
        sourceCurrency: "JPY",
        targetCurrencies: ["USD"],
        manualEntryPromotion: "only-on-request",
        focusedPriceBehavior: "automatic"
      });
    });
    fireEvent.click(screen.getByRole("button", { name: /open camera/i }));
    const composer = screen.getByRole("region", {
      name: /manual price entry/i
    });

    act(() => vi.advanceTimersByTime(60_000));
    expect(
      within(composer).queryByRole("textbox", { name: /jpy amount/i })
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(composer).getByRole("button", {
        name: /open manual price entry/i
      })
    );
    expect(
      within(composer).getByRole("textbox", { name: /jpy amount/i })
    ).toBeInTheDocument();
  });

  it("waits for explicit confirmation before using a member Focused Price", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());

    const view = render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={vi.fn().mockResolvedValue({
          ownerId: "user_member",
          sourceCurrency: "JPY",
          targetCurrencies: ["USD"],
          manualEntryPromotion: "after-5-seconds",
          focusedPriceBehavior: "confirm"
        })}
        loadGuestRate={async () => DEFAULT_RATE}
      />
    );
    await screen.findByText(/approved member mode/i);
    await user.click(screen.getByRole("button", { name: /try without camera/i }));
    await within(
      screen.getByRole("region", { name: /recognition summary/i })
    ).findByText(/^focused price · jpy 4,142$/i);

    expect(
      screen.getByRole("status", { name: /price used for conversion/i })
    ).toHaveTextContent(/waiting for confirmation/i);
    expect(screen.queryByText("USD 27.80")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: /confirm focused price · jpy 4,142/i
      })
    );
    expect(screen.getByText("USD 27.80")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close camera/i }));

    view.rerender(
      <App memberSession={null} loadGuestRate={async () => DEFAULT_RATE} />
    );
    expect(await screen.findByText(/guest mode/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("region", {
        name: /recognition experience settings/i
      })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try without camera/i }));
    await within(
      screen.getByRole("region", { name: /recognition summary/i })
    ).findByText(/^focused price · jpy 4,142$/i);
    expect(
      screen.getByRole("status", { name: /price used for conversion/i })
    ).toHaveTextContent(/focused price in use/i);
  });

  it("invalidates a same-currency confirmation when account A switches to B", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const loadMemberPreferences = vi.fn(async (ownerId: string) => ({
      ownerId,
      sourceCurrency: "JPY" as const,
      targetCurrencies: ["USD" as const],
      manualEntryPromotion: "after-5-seconds" as const,
      focusedPriceBehavior: "confirm" as const
    }));
    const view = render(
      <App
        memberSession={{
          userId: "user_a",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={loadMemberPreferences}
        loadGuestRate={async () => DEFAULT_RATE}
      />
    );
    await screen.findByText(/approved member mode/i);
    await user.click(screen.getByRole("button", { name: /try without camera/i }));
    await screen.findByRole("button", {
      name: /confirm focused price · jpy 4,142/i
    });
    await user.click(
      screen.getByRole("button", {
        name: /confirm focused price · jpy 4,142/i
      })
    );
    expect(screen.getByText("USD 27.80")).toBeInTheDocument();

    view.rerender(
      <App
        memberSession={{
          userId: "user_b",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={loadMemberPreferences}
        loadGuestRate={async () => DEFAULT_RATE}
      />
    );

    await waitFor(() =>
      expect(loadMemberPreferences).toHaveBeenCalledWith(
        "user_b",
        expect.any(AbortSignal)
      )
    );
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: /price used for conversion/i })
      ).toHaveTextContent(/waiting for confirmation/i)
    );
    expect(screen.queryByText("USD 27.80")).not.toBeInTheDocument();
  });

  it("requires a new confirmation when focus returns from A to B to A", async () => {
    const user = userEvent.setup();
    const { stream } = createMediaStream();
    useMediaDevices(vi.fn().mockResolvedValue(stream));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext()
    );
    const successfulRecognition = async (
      _image: unknown,
      pass: RecognitionPassIdentity
    ) =>
      [
          recognizedObservation(
            "4,142円",
            96,
            { x: 64, y: 40, width: 160, height: 80 },
            pass
          ),
          recognizedObservation(
            "980円",
            89,
            { x: 330, y: 200, width: 120, height: 70 },
            pass
          )
        ];
    const recognize = vi.fn(successfulRecognition);
    const recognizer: OcrRecognizer = {
      prepare: vi.fn().mockResolvedValue(undefined),
      recognize,
      terminate: vi.fn().mockResolvedValue(undefined)
    };

    render(
      <App
        memberSession={{
          userId: "user_member",
          getSessionToken: getTestMemberSessionToken
        }}
        loadMemberPreferences={vi.fn().mockResolvedValue({
          ownerId: "user_member",
          sourceCurrency: "JPY",
          targetCurrencies: ["USD"],
          manualEntryPromotion: "after-5-seconds",
          focusedPriceBehavior: "confirm"
        })}
        loadGuestRate={async () => DEFAULT_RATE}
        createRecognizer={() => recognizer}
      />
    );
    await screen.findByText(/approved member mode/i);
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

    const status = screen.getByRole("status", {
      name: /price used for conversion/i
    });
    await waitFor(
      () => expect(status).toHaveTextContent(/waiting for confirmation/i),
      { timeout: 3_000 }
    );
    await user.click(
      screen.getByRole("button", {
        name: /confirm focused price · jpy 4,142/i
      })
    );
    expect(screen.getByText("USD 27.80")).toBeInTheDocument();

    const detectedPrices = screen.getByRole("list", {
      name: /detected prices/i
    });
    await user.click(
      within(detectedPrices).getByRole("button", { name: /jpy 980/i })
    );
    await waitFor(() =>
      expect(status).toHaveTextContent(/waiting for confirmation/i)
    );
    await user.click(
      within(detectedPrices).getByRole("button", { name: /jpy 4,142/i })
    );

    await waitFor(() =>
      expect(status).toHaveTextContent(/waiting for confirmation/i)
    );
    expect(screen.queryByText("USD 27.80")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: /confirm focused price · jpy 4,142/i
      })
    );
    recognize.mockRejectedValue(new Error("runtime interrupted"));
    await screen.findByRole("alert", {}, { timeout: 3_000 });
    recognize.mockImplementation(successfulRecognition);
    await user.click(
      screen.getByRole("button", { name: /try recognition again/i })
    );
    await waitFor(
      () => expect(status).toHaveTextContent(/waiting for confirmation/i),
      { timeout: 3_000 }
    );
    expect(screen.queryByText("USD 27.80")).not.toBeInTheDocument();
  }, 15_000);

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
        targetCurrencies: ["USD"],
        ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
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
      targetCurrencies: ["USD"],
      manualEntryPromotion: "only-on-request",
      focusedPriceBehavior: "confirm"
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
          targetCurrencies: ["USD", "TWD"],
          manualEntryPromotion: "only-on-request",
          focusedPriceBehavior: "confirm"
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
    expect(
      screen.queryByRole("region", {
        name: /recognition experience settings/i
      })
    ).not.toBeInTheDocument();
    expect(saveMemberPreferences).toHaveBeenCalledTimes(1);
  });

  it("requests a newly selected member rate before D1 synchronization completes", async () => {
    const user = userEvent.setup();
    useMediaDevices(vi.fn());
    const saved = createDeferred<MemberPreferences>();
    let preferencesSynchronized = false;
    const loadGuestRate = vi.fn(
      async (_source: CurrencyCode, target: CurrencyCode) => {
        if (target === "TWD" && !preferencesSynchronized) {
          throw new GuestRateLoadError("unauthorized");
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

    await waitFor(() =>
      expect(
        loadGuestRate.mock.calls.filter((call) => call[1] === "TWD")
      ).toHaveLength(1)
    );

    await act(async () => {
      preferencesSynchronized = true;
      saved.resolve({
        ownerId: "user_member",
        sourceCurrency: "JPY",
        targetCurrencies: ["USD", "TWD"],
        ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
      });
    });
    await waitFor(() =>
      expect(
        loadGuestRate.mock.calls.filter((call) => call[1] === "TWD")
          .length
      ).toBeGreaterThanOrEqual(2)
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
      true
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
