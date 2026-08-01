import { describe, expect, it } from "vitest";

import { createGuestPreferenceStore } from "./guestPreferences";

describe("Guest Preference Store", () => {
  it("restores the Guest's Source and single Target Currency", () => {
    const firstVisit = createGuestPreferenceStore(window.localStorage);
    firstVisit.save({ sourceCurrency: "JPY", targetCurrency: "TWD" });

    const reloadedVisit = createGuestPreferenceStore(window.localStorage);

    expect(reloadedVisit.load()).toEqual({
      sourceCurrency: "JPY",
      targetCurrency: "TWD"
    });
  });

  it("uses safe defaults when browser data is malformed", () => {
    window.localStorage.setItem(
      "taglingo.guest-preferences.v1",
      JSON.stringify({ sourceCurrency: "BTC", targetCurrency: ["USD", "EUR"] })
    );

    expect(createGuestPreferenceStore(window.localStorage).load()).toEqual({
      sourceCurrency: "JPY",
      targetCurrency: "USD"
    });
  });

  it("does not restore an invalid same-currency conversion pair", () => {
    window.localStorage.setItem(
      "taglingo.guest-preferences.v1",
      JSON.stringify({ sourceCurrency: "JPY", targetCurrency: "JPY" })
    );

    expect(createGuestPreferenceStore(window.localStorage).load()).toEqual({
      sourceCurrency: "JPY",
      targetCurrency: "USD"
    });
  });

  it("rejects camera-derived and identity fields at the Guest persistence boundary", () => {
    const store = createGuestPreferenceStore(window.localStorage);
    store.save({
      sourceCurrency: "JPY",
      targetCurrency: "TWD",
      cameraFrame: "data:image/jpeg;base64,secret",
      ocrText: "4,142円",
      detectedPrices: [{ minorUnits: 4142 }],
      email: "shopper@example.com"
    } as never);

    expect(window.localStorage.length).toBe(0);
    expect(store.load()).toEqual({
      sourceCurrency: "JPY",
      targetCurrency: "USD"
    });
  });
});
