import { describe, expect, it, vi } from "vitest";

import {
  APP_RELEASE,
  createRecognitionHealthPreferenceStore,
  createRecognitionHealthSession,
  submitRecognitionHealthSummary,
  type RecognitionHealthSummary
} from "./recognitionHealth";

const VALID_SUMMARY: RecognitionHealthSummary = {
  schemaVersion: 1,
  release: APP_RELEASE,
  platform: "other",
  sourceCurrency: "JPY",
  timeToReady: "1-to-5s",
  timeToFirstDetectedPrice: "not-reached",
  timeToFirstFocusedPrice: "not-reached",
  recognitionPassCount: "2-to-5",
  missCount: "1",
  focusChangeCount: "0",
  stableDetectionCount: "0",
  terminalOutcome: "recognition-ended-without-stable-price",
  errorFamily: "none"
};

describe("recognition-health browser boundary", () => {
  it("keeps sharing off and invitation state only in the provided browser storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const store = createRecognitionHealthPreferenceStore(storage);

    expect(store.load()).toEqual({
      sharingEnabled: false,
      invitationShown: false
    });

    store.save({ sharingEnabled: true, invitationShown: true });
    expect(store.load()).toEqual({
      sharingEnabled: true,
      invitationShown: true
    });
    expect([...values.keys()]).toEqual(["taglingo.recognition-health.v1"]);
  });

  it("makes opt-in apply only to sessions that begin after consent", async () => {
    let enabled = false;
    const submit = vi.fn().mockResolvedValue(undefined);
    const beforeConsent = createRecognitionHealthSession({
      consentAtStart: enabled,
      isSharingEnabled: () => enabled,
      platform: "other",
      sourceCurrency: "JPY",
      startedAtMs: 0,
      submit
    });

    enabled = true;
    beforeConsent.record({
      atMs: 2_000,
      ready: true,
      detectedPriceCount: 0,
      hasFocusedPrice: false,
      recognitionPassCount: 2,
      missCount: 1,
      focusChangeCount: 0,
      stableDetectionCount: 0
    });
    await beforeConsent.finish(
      "recognition-ended-without-stable-price",
      "none"
    );
    expect(submit).not.toHaveBeenCalled();

    const afterConsent = createRecognitionHealthSession({
      consentAtStart: enabled,
      isSharingEnabled: () => enabled,
      platform: "other",
      sourceCurrency: "JPY",
      startedAtMs: 10_000,
      submit
    });
    afterConsent.record({
      atMs: 12_000,
      ready: true,
      detectedPriceCount: 0,
      hasFocusedPrice: false,
      recognitionPassCount: 2,
      missCount: 1,
      focusChangeCount: 0,
      stableDetectionCount: 0
    });
    await afterConsent.finish(
      "recognition-ended-without-stable-price",
      "none"
    );

    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith(VALID_SUMMARY);
  });

  it("stops a pending future submission when sharing is turned off", async () => {
    let enabled = true;
    const submit = vi.fn().mockResolvedValue(undefined);
    const session = createRecognitionHealthSession({
      consentAtStart: true,
      isSharingEnabled: () => enabled,
      platform: "other",
      sourceCurrency: "JPY",
      startedAtMs: 0,
      submit
    });
    enabled = false;

    await session.finish("closed-without-price", "none");

    expect(submit).not.toHaveBeenCalled();
  });

  it("emits a closed coarse summary at most once", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const session = createRecognitionHealthSession({
      consentAtStart: true,
      isSharingEnabled: () => true,
      platform: "ios-safari",
      sourceCurrency: "JPY",
      startedAtMs: 1_000,
      submit
    });
    session.record({
      atMs: 2_200,
      ready: true,
      detectedPriceCount: 2,
      hasFocusedPrice: true,
      recognitionPassCount: 24,
      missCount: 7,
      focusChangeCount: 3,
      stableDetectionCount: 2
    });

    await Promise.all([
      session.finish("focused-price-obtained", "none"),
      session.finish("unexpected-recognition-failure", "unexpected")
    ]);

    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith({
      schemaVersion: 1,
      release: APP_RELEASE,
      platform: "ios-safari",
      sourceCurrency: "JPY",
      timeToReady: "1-to-5s",
      timeToFirstDetectedPrice: "1-to-5s",
      timeToFirstFocusedPrice: "1-to-5s",
      recognitionPassCount: "over-20",
      missCount: "6-to-20",
      focusChangeCount: "2-to-5",
      stableDetectionCount: "2-to-5",
      terminalOutcome: "focused-price-obtained",
      errorFamily: "none"
    });
  });

  it("drops failed submissions without cookies, referrer, credentials, or retry", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("offline"));

    await expect(
      submitRecognitionHealthSummary(VALID_SUMMARY, fetch)
    ).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "/api/recognition-health",
      expect.objectContaining({
        method: "POST",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        keepalive: true,
        body: JSON.stringify(VALID_SUMMARY)
      })
    );
    const headers = new Headers(fetch.mock.calls[0][1].headers);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
  });
});
